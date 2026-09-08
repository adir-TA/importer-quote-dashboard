import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Search, Container as ContainerIcon, Trash2, Copy, Download, Upload, AlertCircle,
} from 'lucide-react';
import { useContainers } from '../context/ContainersContext';
import { LoadingState } from '../components';
import { useModal } from '../context/ModalContext';
import { useLanguage } from '../context/LanguageContext';
import { formatDate, downloadBlob } from '../utils/helpers';
import { normalizePayload } from '../utils/containerModel';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

function Containers() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user } = useAuth();
  const { confirm, alert: showAlert } = useModal();
  const {
    containers, branches, loading, loadError,
    createContainer, deleteContainer, duplicateContainer, refresh, seedBranches,
  } = useContainers();

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return containers;
    return containers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.container_no || '').toLowerCase().includes(q)
    );
  }, [containers, query]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      if (!branches.length) await seedBranches();
      const next = containers.length + 1;
      const created = await createContainer({ name: `${t('containers.defaultName')}-${next}`, containerNo: '' });
      navigate(`/containers/${created.id}`);
    } catch (err) {
      showAlert({ title: t('containers.createFailed'), message: err.message, type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (c) => {
    const confirmed = await confirm({
      title: t('containers.deleteTitle'),
      message: t('containers.deleteMessage').replace('{name}', c.name || c.container_no || ''),
      type: 'danger',
      confirmText: t('actions.delete'),
    });
    if (!confirmed) return;
    try { await deleteContainer(c.id); }
    catch (err) { showAlert({ title: t('containers.deleteFailed'), message: err.message, type: 'error' }); }
  };

  /** Export every container in the same shape the standalone tool produced. */
  const handleExport = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.from('containers').select('*');
      if (error) throw error;
      const backup = {
        type: 'ha-containers',
        v: 3,
        exportedAt: new Date().toISOString(),
        containers: (data || []).map(c => ({
          id: c.id,
          name: c.name,
          containerNo: c.container_no,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
          ...normalizePayload(c.payload),
        })),
      };
      downloadBlob(
        new Blob([JSON.stringify(backup)], { type: 'application/json' }),
        `${t('containers.backupName')} ${new Date().toLocaleDateString('he-IL').replace(/\./g, '-')}.json`
      );
    } catch (err) {
      showAlert({ title: t('containers.exportFailed'), message: err.message, type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  /** Import a backup produced by this app or by the standalone tool. */
  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      setBusy(true);
      try {
        const parsed = JSON.parse(await file.text());
        const list = Array.isArray(parsed?.containers) ? parsed.containers : null;
        if (!list) throw new Error(t('containers.importBadFile'));

        const rows = list.map(c => ({
          user_id: user.id,
          name: c.name || '',
          container_no: c.containerNo || '',
          payload: normalizePayload(c),
        }));

        const { error } = await supabase.from('containers').insert(rows);
        if (error) throw error;

        await refresh();
        showAlert({
          title: t('containers.importDone'),
          message: t('containers.importCount').replace('{n}', rows.length),
          type: 'success',
        });
      } catch (err) {
        showAlert({ title: t('containers.importFailed'), message: err.message, type: 'error' });
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  return (
    <div className="page">
      <div className="header">
        <h2>{t('containers.title')}</h2>
        <div className="header-actions">
          <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={busy}>
            <Download size={16} /> {t('containers.exportBackup')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleImport} disabled={busy}>
            <Upload size={16} /> {t('containers.importBackup')}
          </button>
          <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={busy}>
            <Plus size={16} /> {t('containers.newContainer')}
          </button>
        </div>
      </div>

      <div className="content">
        {loadError && (
          <div className="validation-error" role="alert" style={{ marginBottom: 16 }}>
            <AlertCircle size={16} /><span>{loadError}</span>
          </div>
        )}

        <div className="input-with-icon" style={{ maxWidth: 380, marginBottom: 24 }}>
          <Search size={16} className="input-icon" />
          <input
            className="form-input"
            placeholder={t('containers.searchPlaceholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <ContainerIcon size={32} />
            <h3>{containers.length ? t('containers.noMatches') : t('containers.emptyTitle')}</h3>
            <p>{containers.length ? t('containers.noMatchesHint') : t('containers.emptyHint')}</p>
            {!containers.length && (
              <button type="button" className="btn btn-primary" onClick={handleCreate} disabled={busy}>
                <Plus size={16} /> {t('containers.newContainer')}
              </button>
            )}
          </div>
        ) : (
          <div className="ccard-grid">
            {filtered.map(c => (
              <div
                key={c.id}
                className="card card-interactive ccard"
                onClick={() => navigate(`/containers/${c.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') navigate(`/containers/${c.id}`); }}
              >
                <div className="ccard-main">
                  <div className="ccard-title">{c.name || t('containers.untitled')}</div>
                  {c.container_no && (
                    <div className="ccard-no">{t('containers.number')} {c.container_no}</div>
                  )}
                </div>
                <div className="ccard-meta">{t('containers.updated')} {formatDate(c.updated_at)}</div>
                <div className="ccard-actions" onClick={e => e.stopPropagation()}>
                  <button
                    type="button" className="icon-btn" title={t('containers.duplicate')}
                    onClick={() => duplicateContainer(c.id).catch(err =>
                      showAlert({ title: t('containers.duplicateFailed'), message: err.message, type: 'error' }))}
                  ><Copy size={15} /></button>
                  <button
                    type="button" className="icon-btn" title={t('actions.delete')}
                    onClick={() => handleDelete(c)}
                  ><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default Containers;
