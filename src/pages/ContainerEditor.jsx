import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight, FileOutput, Undo2, Redo2, Maximize2, Minimize2, AlertCircle, X, Check,
} from 'lucide-react';
import { useContainers } from '../context/ContainersContext';
import { useModal } from '../context/ModalContext';
import { useLanguage } from '../context/LanguageContext';
import { LoadingState } from '../components';
import ContainerGrid from '../components/containers/ContainerGrid';
import GenerateModal from '../components/containers/GenerateModal';
import {
  parseProducts, parseBranches, branchesToText, normalizeGroups, resizeGrid,
  emptyPayload, groupColor, num,
} from '../utils/containerModel';

const UNDO_LIMIT = 60;
const COALESCE_MS = 700;

function ContainerEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { confirm, alert: showAlert } = useModal();
  const {
    loadContainer, queueSave, flushSave, saveError, savedAt, clearSaveError, saveBranches,
  } = useContainers();

  const [record, setRecord] = useState(null);
  const [payload, setPayload] = useState(emptyPayload());
  const [name, setName] = useState('');
  const [containerNo, setContainerNo] = useState('');
  const [version, setVersion] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [big, setBig] = useState(() => {
    try { return localStorage.getItem('ha-containers-big') === '1'; } catch { return false; }
  });

  const [copySource, setCopySource] = useState(null);
  const [copyStatus, setCopyStatus] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);

  // Undo/redo holds snapshots of THIS container only, in memory. The original
  // snapshotted the whole localStorage database, which cannot work remotely.
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const lastKey = useRef(null);
  const lastTime = useRef(0);
  const [historyTick, setHistoryTick] = useState(0);

  // ------------------------------------------------
  // Load
  // ------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await loadContainer(id);
        if (cancelled) return;
        if (!data) { setError(t('containers.notFound')); return; }
        setRecord(data);
        setPayload(data.payload);
        setName(data.name || '');
        setContainerNo(data.container_no || '');
        setVersion(data.version);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id, loadContainer, t]);

  // ------------------------------------------------
  // Persist
  // ------------------------------------------------
  const persist = useCallback((next, immediate = false) => {
    const job = {
      id,
      name: next.name ?? name,
      containerNo: next.containerNo ?? containerNo,
      payload: next.payload ?? payload,
      version,
      onSaved: (v) => setVersion(v),
    };
    queueSave(job, immediate);
  }, [id, name, containerNo, payload, version, queueSave]);

  const snapshot = useCallback(() => JSON.stringify({ payload, name, containerNo }), [payload, name, containerNo]);

  const pushUndo = useCallback((key) => {
    const now = Date.now();
    if (key && key === lastKey.current && now - lastTime.current < COALESCE_MS) {
      lastTime.current = now;
      return;
    }
    undoStack.current.push(snapshot());
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    redoStack.current = [];
    lastKey.current = key || null;
    lastTime.current = now;
    setHistoryTick(n => n + 1);
  }, [snapshot]);

  const applySnapshot = useCallback((raw) => {
    const s = JSON.parse(raw);
    setPayload(s.payload);
    setName(s.name);
    setContainerNo(s.containerNo);
    persist({ payload: s.payload, name: s.name, containerNo: s.containerNo }, true);
    setHistoryTick(n => n + 1);
  }, [persist]);

  const doUndo = useCallback(() => {
    if (!undoStack.current.length) return;
    redoStack.current.push(snapshot());
    applySnapshot(undoStack.current.pop());
    lastKey.current = null;
  }, [snapshot, applySnapshot]);

  const doRedo = useCallback(() => {
    if (!redoStack.current.length) return;
    undoStack.current.push(snapshot());
    applySnapshot(redoStack.current.pop());
    lastKey.current = null;
  }, [snapshot, applySnapshot]);

  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo]);

  // Leaving the app cancels an in-progress column copy so Ctrl+V pastes
  // whatever was copied elsewhere, not our internal column.
  useEffect(() => {
    const cancel = () => { setCopySource(null); setCopyStatus(''); };
    const onEsc = (e) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('blur', cancel);
    document.addEventListener('keydown', onEsc);
    return () => {
      window.removeEventListener('blur', cancel);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const update = useCallback((mutate, { key, immediate } = {}) => {
    pushUndo(key);
    setPayload(prev => {
      const next = mutate(prev);
      persist({ payload: next }, immediate);
      return next;
    });
  }, [pushUndo, persist]);

  // ------------------------------------------------
  // Setup panel
  // ------------------------------------------------
  const rebuild = useCallback(() => {
    const products = parseProducts(payload.draftProducts);
    const { names, groups } = parseBranches(payload.draftStores);

    if (!products.length) {
      showAlert({ title: t('containers.needProducts'), message: t('containers.needProductsHint'), type: 'warning' });
      return;
    }

    // An empty branch list is the same kind of accident as an empty product
    // list: rebuilding on it drops every column, so every quantity goes with
    // them - and this write is immediate, so undo is the only way back.
    if (!names.length) {
      showAlert({ title: t('containers.needBranches'), message: t('containers.needBranchesHint'), type: 'warning' });
      return;
    }

    const resized = resizeGrid({
      products, branches: names,
      prevProducts: payload.products, prevBranches: payload.stores,
      qty: payload.qty, caps: payload.caps, limits: payload.limits,
    });

    update(prev => ({
      ...prev,
      products,
      stores: names,
      storeGroups: normalizeGroups(groups),
      ...resized,
      docExclude: prev.docExclude.filter(n => names.includes(n)),
    }), { immediate: true });
  }, [payload, update, showAlert, t]);

  /**
   * Promote this container's branch list to the account-wide default, so the
   * next new container starts from it. Without this the master list could only
   * ever be seeded once and never corrected.
   */
  const [savingBranches, setSavingBranches] = useState(false);
  const saveAsDefaultBranches = useCallback(async () => {
    const { names, groups } = parseBranches(payload.draftStores);
    if (!names.length) {
      showAlert({ title: t('containers.needBranches'), message: t('containers.needBranchesHint'), type: 'warning' });
      return;
    }
    const ok = await confirm({
      title: t('containers.saveDefaults'),
      message: t('containers.saveDefaultsConfirm'),
      confirmText: t('containers.saveDefaults'),
    });
    if (!ok) return;

    setSavingBranches(true);
    try {
      await saveBranches(names, normalizeGroups(groups));
      showAlert({
        title: t('containers.saveDefaultsDone'),
        message: t('containers.saveDefaultsDoneHint').replace('{n}', String(names.length)),
        type: 'success',
      });
    } catch (err) {
      showAlert({ title: t('containers.saveDefaultsFailed'), message: err.message, type: 'error' });
    } finally {
      setSavingBranches(false);
    }
  }, [payload.draftStores, saveBranches, confirm, showAlert, t]);

  // ------------------------------------------------
  // Grid handlers
  // ------------------------------------------------
  const handleCellChange = useCallback(({ row, col, field, value }) => {
    const clean = String(value).replace(/[^0-9.\-]/g, '');
    const key = field ? `${field}:${row}` : `cell:${row}:${col}`;

    update(prev => {
      if (field === 'cap') {
        const caps = [...prev.caps]; caps[row] = clean;
        return { ...prev, caps };
      }
      if (field === 'limit') {
        const limits = [...prev.limits]; limits[row] = clean;
        return { ...prev, limits };
      }
      const qty = prev.qty.map(r => [...r]);
      qty[row][col] = clean;
      return { ...prev, qty };
    }, { key });
  }, [update]);

  const handleProductRename = useCallback((row, value) => {
    update(prev => {
      const products = [...prev.products];
      products[row] = value;
      return { ...prev, products, draftProducts: products.join('\n') };
    }, { key: `pname:${row}` });
  }, [update]);

  const handleRemoveProduct = useCallback(async (row) => {
    const confirmed = await confirm({
      title: t('containers.removeProductTitle'),
      message: t('containers.removeProductMessage').replace('{name}', payload.products[row] || ''),
      type: 'danger',
      confirmText: t('actions.delete'),
    });
    if (!confirmed) return;

    update(prev => {
      const products = prev.products.filter((_, i) => i !== row);
      return {
        ...prev,
        products,
        qty: prev.qty.filter((_, i) => i !== row),
        caps: prev.caps.filter((_, i) => i !== row),
        limits: prev.limits.filter((_, i) => i !== row),
        draftProducts: products.join('\n'),
      };
    }, { immediate: true });
  }, [confirm, payload.products, t, update]);

  const handleStartCopy = useCallback((j) => {
    if (copySource === j) { setCopySource(null); setCopyStatus(''); return; }
    const filled = payload.qty.filter(row => num(row[j]) > 0).length;
    if (!filled) {
      setCopyStatus(t('containers.copyEmpty').replace('{branch}', payload.stores[j]));
      return;
    }
    setCopySource(j);
    setCopyStatus(t('containers.copyReady')
      .replace('{n}', filled)
      .replace('{branch}', payload.stores[j]));
  }, [copySource, payload.qty, payload.stores, t]);

  const handlePasteColumn = useCallback(async (dst) => {
    if (copySource === null || dst === copySource) return;

    const hasData = payload.qty.some(row => num(row[dst]) > 0);
    if (hasData) {
      const confirmed = await confirm({
        title: t('containers.overwriteTitle'),
        message: t('containers.overwriteMessage')
          .replace('{to}', payload.stores[dst])
          .replace('{from}', payload.stores[copySource]),
        type: 'warning',
        confirmText: t('containers.overwriteConfirm'),
      });
      if (!confirmed) return;
    }

    const src = copySource;
    update(prev => ({
      ...prev,
      qty: prev.qty.map(row => {
        const next = [...row];
        next[dst] = row[src];
        return next;
      }),
    }), { immediate: true });

    setCopyStatus(t('containers.copyDone')
      .replace('{from}', payload.stores[src])
      .replace('{to}', payload.stores[dst]));
  }, [copySource, payload.qty, payload.stores, confirm, t, update]);

  const handlePasteGrid = useCallback((result) => {
    update(prev => ({
      ...prev,
      products: result.products,
      qty: result.qty,
      caps: result.caps,
      limits: result.limits,
      draftProducts: result.products.join('\n'),
    }), { immediate: true });

    const r = result.report;
    const notes = [t('containers.pasteFilled').replace('{n}', r.filled)];
    if (r.addedRows) notes.push(t('containers.pasteAdded').replace('{n}', r.addedRows));
    if (r.skippedRows) notes.push(t('containers.pasteSkippedRows').replace('{n}', r.skippedRows));
    if (r.skippedCols) notes.push(t('containers.pasteSkippedCols').replace('{n}', r.skippedCols));
    if (r.badCells) notes.push(t('containers.pasteBad').replace('{n}', r.badCells));
    setCopyStatus(notes.join(' · '));
  }, [update, t]);

  const toggleBig = () => {
    setBig(v => {
      const next = !v;
      try { localStorage.setItem('ha-containers-big', next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  const summary = useMemo(() => ({
    products: payload.products.length,
    branches: payload.stores.length,
    boxes: payload.qty.reduce((a, row) => a + row.reduce((b, v) => b + num(v), 0), 0),
  }), [payload]);

  if (loading) return <div className="page"><div className="content"><LoadingState /></div></div>;

  if (error) {
    return (
      <div className="page"><div className="content">
        <div className="empty-state">
          <AlertCircle size={32} />
          <h3>{error}</h3>
          <button type="button" className="btn btn-primary" onClick={() => navigate('/containers')}>
            {t('containers.backToList')}
          </button>
        </div>
      </div></div>
    );
  }

  return (
    <div className="page">
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <button type="button" className="icon-btn" onClick={() => navigate('/containers')} aria-label={t('containers.backToList')}>
            <ArrowRight size={18} />
          </button>
          <div style={{ minWidth: 0 }}>
            <h2 style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {name || t('containers.untitled')}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>
              {t('containers.summary')
                .replace('{p}', summary.products)
                .replace('{b}', summary.branches)
                .replace('{n}', summary.boxes)}
            </p>
          </div>
        </div>

        <div className="header-actions">
          {savedAt && !saveError && (
            <span className="csaved"><Check size={14} /> {t('containers.saved')} {savedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
          )}
          <button type="button" className="icon-btn" onClick={doUndo}
            disabled={!undoStack.current.length} title={t('containers.undo')} data-tick={historyTick}>
            <Undo2 size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={doRedo}
            disabled={!redoStack.current.length} title={t('containers.redo')}>
            <Redo2 size={16} />
          </button>
          <button type="button" className="icon-btn" onClick={toggleBig} title={t('containers.bigView')}>
            {big ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button type="button" className="btn btn-primary"
            onClick={() => { flushSave(); setShowGenerate(true); }}
            disabled={!payload.products.length || !payload.stores.length}>
            <FileOutput size={16} /> {t('containers.generate')}
          </button>
        </div>
      </div>

      <div className="content">
        {saveError === 'STALE' && (
          <div className="validation-error" role="alert" style={{ marginBottom: 16 }}>
            <AlertCircle size={16} />
            <span>{t('containers.staleWarning')}</span>
            <button type="button" className="btn btn-sm btn-secondary"
              onClick={() => { clearSaveError(); window.location.reload(); }}>
              {t('containers.reload')}
            </button>
          </div>
        )}
        {saveError && saveError !== 'STALE' && (
          <div className="validation-error" role="alert" style={{ marginBottom: 16 }}>
            <AlertCircle size={16} /><span>{t('containers.saveFailed')}: {saveError}</span>
          </div>
        )}

        {/* Name and number */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-body cname-row">
            <div className="form-group" style={{ marginBottom: 0, flex: 2 }}>
              <label className="form-label" htmlFor="cname">{t('containers.nameLabel')}</label>
              <input id="cname" className="form-input" value={name}
                onChange={e => { setName(e.target.value); persist({ name: e.target.value }); }}
                onBlur={() => flushSave()} />
            </div>
            <div className="form-group" style={{ marginBottom: 0, flex: 1 }}>
              <label className="form-label" htmlFor="cno">{t('containers.numberLabel')}</label>
              <input id="cno" className="form-input" value={containerNo}
                onChange={e => { setContainerNo(e.target.value); persist({ containerNo: e.target.value }); }}
                onBlur={() => flushSave()} />
            </div>
          </div>
        </div>

        {/* Products and branches */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">{t('containers.setupTitle')}</span>
          </div>
          <div className="card-body">
            <p className="form-hint" style={{ marginTop: 0 }}>{t('containers.setupHint')}</p>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label" htmlFor="cproducts">{t('containers.products')}</label>
                <textarea id="cproducts" className="form-input" rows={8}
                  value={payload.draftProducts}
                  onChange={e => update(prev => ({ ...prev, draftProducts: e.target.value }), { key: 'draftP' })}
                  onBlur={() => flushSave()} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="cstores">{t('containers.branches')}</label>
                <textarea id="cstores" className="form-input" rows={8}
                  value={payload.draftStores}
                  onChange={e => update(prev => ({ ...prev, draftStores: e.target.value }), { key: 'draftS' })}
                  onBlur={() => flushSave()} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={rebuild}>
                {t('containers.rebuild')}
              </button>
              <button type="button" className="btn btn-secondary" onClick={saveAsDefaultBranches}
                disabled={savingBranches}>
                {t('containers.saveDefaults')}
              </button>
            </div>
          </div>
        </div>

        {/* Branch groups */}
        {payload.stores.length > 0 && (
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header"><span className="card-title">{t('containers.groupsTitle')}</span></div>
            <div className="card-body cgroups">
              {payload.stores.map((store, j) => {
                const edge = j === 0 || payload.storeGroups[j] !== payload.storeGroups[j - 1];
                return (
                  <React.Fragment key={store + j}>
                    {edge && j > 0 && <div className="cgroups-break" />}
                    <span className="cgroups-chip" style={{ background: `#${groupColor(payload.storeGroups[j] ?? 0)}` }}>
                      {store}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* Grid */}
        {payload.products.length > 0 && payload.stores.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">{t('containers.quantities')}</span>
              {copySource !== null && (
                <button type="button" className="btn btn-ghost btn-sm"
                  onClick={() => { setCopySource(null); setCopyStatus(''); }}>
                  <X size={14} /> {t('containers.cancelCopy')}
                </button>
              )}
            </div>
            <div className="card-body">
              <p className="form-hint" style={{ marginTop: 0 }}>{t('containers.gridHint')}</p>
              {copyStatus && <p className="cstatus">{copyStatus}</p>}
              <ContainerGrid
                products={payload.products}
                stores={payload.stores}
                storeGroups={payload.storeGroups}
                qty={payload.qty}
                caps={payload.caps}
                limits={payload.limits}
                copySource={copySource}
                big={big}
                onStartCopy={handleStartCopy}
                onPasteColumn={handlePasteColumn}
                onCellChange={handleCellChange}
                onProductRename={handleProductRename}
                onPasteGrid={handlePasteGrid}
                onRemoveProduct={handleRemoveProduct}
              />
            </div>
          </div>
        )}
      </div>

      <GenerateModal
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        payload={payload}
        name={name}
        containerNo={containerNo}
        onExcludeChange={(docExclude) =>
          update(prev => ({ ...prev, docExclude }), { immediate: true })}
      />
    </div>
  );
}

export default ContainerEditor;
