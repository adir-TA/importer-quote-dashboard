import React, { useMemo, useState } from 'react';
import {
  Printer, FileText, FileSpreadsheet, ChevronRight, ChevronLeft, AlertTriangle,
} from 'lucide-react';
import Modal from '../Modal';
import { groupColor, isBranchIncluded, overCapacityRows, overLimitCells } from '../../utils/containerModel';
import {
  branchPages, printPages, downloadDoc, downloadGridXlsx, downloadRemainingXlsx, safeName,
} from '../../utils/containerExport';

/**
 * Branch picker plus a real preview of the printed pages.
 *
 * The point of the preview is to remove the "open it in Word just to check"
 * round trip - what is rendered here is the same HTML that prints and that
 * the .doc contains.
 */
function GenerateModal({ open, onClose, payload, name, containerNo, onExcludeChange }) {
  const [pageIndex, setPageIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { products, stores, storeGroups, qty, caps, limits, docExclude } = payload;

  const pages = useMemo(
    () => (open ? branchPages(payload, containerNo) : []),
    [open, payload, containerNo]
  );

  const groups = useMemo(() => {
    const out = [];
    stores.forEach((store, j) => {
      const g = storeGroups[j] ?? 0;
      if (!out[g]) out[g] = { color: groupColor(g), items: [] };
      out[g].items.push({ store, j });
    });
    return out.filter(Boolean);
  }, [stores, storeGroups]);

  const warnings = useMemo(() => {
    const list = [];
    const over = overCapacityRows(qty, caps);
    if (over.length) {
      list.push(`${over.length} מוצרים חולקו מעבר לכמות במכולה: ${over.map(i => products[i]).join(', ')}`);
    }
    const overCells = overLimitCells(qty, limits);
    if (overCells.length) list.push(`${overCells.length} תאים חורגים מהמקסימום לסניף`);
    return list;
  }, [qty, caps, limits, products]);

  const baseName = safeName(name) || `מכולה-${containerNo || ''}`;
  const meta = { baseName, name, containerNo };

  const toggleBranch = (store) => {
    const next = isBranchIncluded(store, docExclude)
      ? [...docExclude, store]
      : docExclude.filter(s => s !== store);
    onExcludeChange(next);
    setPageIndex(0);
  };

  const toggleGroup = (items) => {
    const allOn = items.every(({ store }) => isBranchIncluded(store, docExclude));
    const names = items.map(({ store }) => store);
    onExcludeChange(allOn
      ? [...docExclude, ...names.filter(n => !docExclude.includes(n))]
      : docExclude.filter(s => !names.includes(s)));
    setPageIndex(0);
  };

  const run = async (fn, label) => {
    setBusy(true); setError('');
    try { await fn(); }
    catch (err) { console.error(`[Containers] ${label} failed:`, err); setError(err.message || 'הפעולה נכשלה'); }
    finally { setBusy(false); }
  };

  if (!open) return null;

  const page = pages[Math.min(pageIndex, pages.length - 1)];

  return (
    <Modal
      title="יצירת הקבצים"
      size="xl"
      onClose={onClose}
      footer={(
        <div className="cgen-footer">
          <span className="cgen-count">
            {pages.length ? `${pages.length} דפים` : 'אין דפים להפקה'}
          </span>
          <div className="cgen-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>סגירה</button>
            <button
              type="button" className="btn btn-secondary" disabled={busy || !pages.length}
              onClick={() => run(() => downloadRemainingXlsx(payload, meta), 'remaining')}
            >
              <FileSpreadsheet size={16} /> נותרים
            </button>
            <button
              type="button" className="btn btn-secondary" disabled={busy}
              onClick={() => run(() => downloadGridXlsx(payload, meta), 'grid')}
            >
              <FileSpreadsheet size={16} /> אקסל
            </button>
            <button
              type="button" className="btn btn-secondary" disabled={busy || !pages.length}
              onClick={() => run(async () => downloadDoc(pages, meta), 'doc')}
            >
              <FileText size={16} /> וורד
            </button>
            <button
              type="button" className="btn btn-primary" disabled={busy || !pages.length}
              onClick={() => run(async () => printPages(pages, baseName), 'print')}
            >
              <Printer size={16} /> הדפסה
            </button>
          </div>
        </div>
      )}
    >
      {warnings.length > 0 && (
        <div className="validation-warning cgen-warn" role="alert">
          <AlertTriangle size={16} />
          <div>{warnings.map(w => <p key={w}>{w}</p>)}</div>
        </div>
      )}

      {error && (
        <div className="validation-error cgen-warn" role="alert">
          <AlertTriangle size={16} /><span>{error}</span>
        </div>
      )}

      <div className="cgen-body">
        {/* Branch picker */}
        <div className="cgen-pick">
          <p className="form-hint">
            הסניפים המסומנים מקבלים דף. סניף בלי כמויות לא יקבל דף גם אם הוא מסומן.
          </p>
          {groups.map((group, gi) => {
            const on = group.items.filter(({ store }) => isBranchIncluded(store, docExclude)).length;
            return (
              <div key={gi} className="cgen-group" style={{ borderColor: `#${group.color}` }}>
                <button
                  type="button"
                  className="cgen-group-head"
                  style={{ background: `#${group.color}` }}
                  onClick={() => toggleGroup(group.items)}
                >
                  קבוצה {gi + 1} · {on}/{group.items.length}
                </button>
                {group.items.map(({ store, j }) => (
                  <label key={store + j} className="cgen-branch">
                    <input
                      type="checkbox"
                      checked={isBranchIncluded(store, docExclude)}
                      onChange={() => toggleBranch(store)}
                    />
                    <span>{store}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>

        {/* Live preview of the printed page */}
        <div className="cgen-preview">
          {page ? (
            <>
              <div className="cgen-preview-bar">
                <button
                  type="button" className="icon-btn"
                  disabled={pageIndex === 0}
                  onClick={() => setPageIndex(i => Math.max(0, i - 1))}
                  aria-label="הדף הקודם"
                ><ChevronRight size={16} /></button>
                <span>{pageIndex + 1} / {pages.length} · {page.branch}</span>
                <button
                  type="button" className="icon-btn"
                  disabled={pageIndex >= pages.length - 1}
                  onClick={() => setPageIndex(i => Math.min(pages.length - 1, i + 1))}
                  aria-label="הדף הבא"
                ><ChevronLeft size={16} /></button>
              </div>
              {/* Rendered from the same `items` the print and .doc outputs use,
                  as JSX rather than injected HTML - product names are user
                  data and never need to become markup. */}
              <div className="cgen-page" dir="rtl">
                <h1>{page.title}</h1>
                <div className={page.items.length > 18 ? 'cgen-page-cols' : ''}>
                  {page.items.map((item, k) => (
                    <p key={k}>{item.qty} {item.product}</p>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <FileText size={28} />
              <h3>אין דפים להצגה</h3>
              <p>אף סניף מסומן לא קיבל כמויות.</p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

export default GenerateModal;
