import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Copy, X } from 'lucide-react';
import {
  groupColor, FILL, num, hasValue, rowTotal, rowRemaining, isOverLimit,
  parseClipboardGrid, isGridPaste, applyPaste,
} from '../../utils/containerModel';

/**
 * The quantity grid.
 *
 * Column indices used for navigation:
 *   0            product name
 *   1..n         branches
 *   n+1          total in container (capacity)
 *   n+2          max per branch (limit)
 * The total-boxes and remaining columns are computed, so they are not
 * focusable and are skipped when arrowing across.
 */
function ContainerGrid({
  products, stores, storeGroups, qty, caps, limits,
  copySource, onStartCopy, onPasteColumn,
  onCellChange, onProductRename, onPasteGrid, onRemoveProduct,
  big,
}) {
  const wrapRef = useRef(null);
  const lastNavCol = stores.length + 2;

  const focusCell = useCallback((r, c) => {
    const el = wrapRef.current?.querySelector(
      `[data-nav-r="${r}"][data-nav-c="${c}"]`
    );
    if (el) {
      el.focus({ preventScroll: false });
      if (el.select) el.select();
    }
  }, []);

  // ------------------------------------------------
  // Keyboard navigation
  // ------------------------------------------------
  const handleKeyDown = useCallback((e) => {
    const el = e.target;
    if (el.dataset.navR === undefined) return;

    const r = +el.dataset.navR;
    const c = +el.dataset.navC;

    let nr = r;
    let nc = c;

    switch (e.key) {
      case 'ArrowUp':    nr = r - 1; break;
      case 'ArrowDown':
      case 'Enter':      nr = r + 1; break;
      case 'ArrowLeft':
        // RTL: left arrow moves to the NEXT column visually
        if (el.selectionStart !== el.value.length && e.key === 'ArrowLeft') return;
        nc = c + 1; break;
      case 'ArrowRight':
        if (el.selectionStart !== 0 && e.key === 'ArrowRight') return;
        nc = c - 1; break;
      case 'Tab':
        nc = e.shiftKey ? c - 1 : c + 1;
        break;
      case 'Escape':
        el.blur();
        return;
      default:
        return;
    }

    if (nr < 0 || nr >= products.length) return;
    if (nc < 0 || nc > lastNavCol) return;

    e.preventDefault();
    focusCell(nr, nc);
  }, [products.length, lastNavCol, focusCell]);

  // ------------------------------------------------
  // Paste from Excel
  // ------------------------------------------------
  const handlePaste = useCallback((e) => {
    const el = e.target;
    if (!el?.dataset || el.dataset.navR === undefined) return;

    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text || !isGridPaste(text)) return; // a single value pastes normally

    const anchorRow = +el.dataset.navR;
    const anchorCol = +el.dataset.navC;

    // Every editable column takes a paste (name, branches, capacity, max per
    // branch); the read-only derived cells carry no input to paste into, so
    // there is nothing left to reject here.
    e.preventDefault();

    const result = applyPaste({
      grid: parseClipboardGrid(text),
      anchorRow,
      anchorCol,
      products, branches: stores, qty, caps, limits,
    });

    onPasteGrid(result, { anchorRow, anchorCol });
  }, [products, stores, qty, caps, limits, onPasteGrid]);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    node.addEventListener('paste', handlePaste);
    return () => node.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  // ------------------------------------------------
  // Derived values
  // ------------------------------------------------
  const rows = useMemo(() => products.map((product, i) => {
    const total = rowTotal(qty[i]);
    const left = rowRemaining(qty[i], caps[i]);
    return { product, i, total, left };
  }), [products, qty, caps]);

  const columnTotals = useMemo(
    () => stores.map((_, j) => qty.reduce((a, row) => a + num(row[j]), 0)),
    [stores, qty]
  );

  const bg = (hex) => ({ backgroundColor: `#${hex}` });

  return (
    <div className={`cgrid-wrap ${big ? 'cgrid-big' : ''}`} ref={wrapRef}>
      <table className="cgrid" onKeyDown={handleKeyDown}>
        <thead>
          <tr>
            <th className="cgrid-name-h" style={bg(FILL.name)}>מוצר</th>

            {stores.map((store, j) => {
              const edge = j > 0 && storeGroups[j] !== storeGroups[j - 1];
              const isSource = copySource === j;
              const pastable = copySource !== null && copySource !== j;
              return (
                <th
                  key={store + j}
                  className={[
                    'cgrid-store',
                    edge ? 'cgrid-edge' : '',
                    isSource ? 'cgrid-copysrc' : '',
                    pastable ? 'cgrid-pastable' : '',
                  ].filter(Boolean).join(' ')}
                  style={bg(groupColor(storeGroups[j] ?? 0))}
                  onClick={() => { if (pastable) onPasteColumn(j); }}
                  title={pastable ? `הדבקה אל ${store}` : undefined}
                >
                  <span className="cgrid-store-name">{store}</span>
                  <button
                    type="button"
                    className="cgrid-colcopy"
                    title="העתקת העמודה"
                    onClick={(e) => { e.stopPropagation(); onStartCopy(j); }}
                  >
                    <Copy size={12} />
                  </button>
                </th>
              );
            })}

            <th className="cgrid-calc-h cgrid-c-tot" style={bg(FILL.total)}>סה"כ ארגזים</th>
            <th className="cgrid-calc-h cgrid-c-cap" style={bg(FILL.cap)}>סה"כ במכולה</th>
            <th className="cgrid-calc-h cgrid-c-left" style={bg(FILL.left)}>נותרים</th>
            <th className="cgrid-calc-h cgrid-c-max" style={bg(FILL.max)}>מקס' לסניף</th>
          </tr>
        </thead>

        <tbody>
          {rows.map(({ product, i, total, left }) => (
            <tr key={i}>
              <th className="cgrid-name" style={bg(FILL.name)}>
                <input
                  className="cgrid-nameinput"
                  value={product}
                  data-nav-r={i}
                  data-nav-c={0}
                  onChange={(e) => onProductRename(i, e.target.value)}
                  onFocus={(e) => e.target.select()}
                />
                <button
                  type="button"
                  className="cgrid-rowdel"
                  title="מחיקת השורה"
                  onClick={() => onRemoveProduct(i)}
                >
                  <X size={12} />
                </button>
              </th>

              {stores.map((store, j) => {
                const edge = j > 0 && storeGroups[j] !== storeGroups[j - 1];
                const value = qty[i][j] ?? '';
                const over = isOverLimit(value, limits[i]);
                return (
                  <td
                    key={store + j}
                    className={[
                      edge ? 'cgrid-edge' : '',
                      over ? 'cgrid-over' : '',
                      copySource === j ? 'cgrid-copycol' : '',
                    ].filter(Boolean).join(' ')}
                    style={bg(groupColor(storeGroups[j] ?? 0))}
                  >
                    <input
                      inputMode="numeric"
                      value={value}
                      className={num(value) === 0 && value !== '' ? 'cgrid-zero' : ''}
                      data-nav-r={i}
                      data-nav-c={j + 1}
                      title={over ? `מעל המקסימום לסניף (${limits[i]})` : undefined}
                      onChange={(e) => onCellChange({ row: i, col: j, value: e.target.value })}
                      onFocus={(e) => e.target.select()}
                    />
                  </td>
                );
              })}

              <td className="cgrid-calc cgrid-c-tot" style={bg(FILL.total)}>{total}</td>

              <td className="cgrid-input-calc cgrid-c-cap" style={bg(FILL.cap)}>
                <input
                  inputMode="numeric"
                  value={caps[i] ?? ''}
                  data-nav-r={i}
                  data-nav-c={stores.length + 1}
                  onChange={(e) => onCellChange({ row: i, field: 'cap', value: e.target.value })}
                  onFocus={(e) => e.target.select()}
                />
              </td>

              <td
                className={[
                  'cgrid-calc', 'cgrid-c-left',
                  left !== null && left < 0 ? 'cgrid-neg' : '',
                  left === 0 ? 'cgrid-done' : '',
                ].filter(Boolean).join(' ')}
                style={bg(FILL.left)}
              >
                {left === null ? '—' : left}
              </td>

              <td className="cgrid-input-calc cgrid-c-max" style={bg(FILL.max)}>
                <input
                  inputMode="numeric"
                  placeholder="—"
                  value={limits[i] ?? ''}
                  data-nav-r={i}
                  data-nav-c={stores.length + 2}
                  onChange={(e) => onCellChange({ row: i, field: 'limit', value: e.target.value })}
                  onFocus={(e) => e.target.select()}
                />
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <th className="cgrid-name" style={bg(FILL.name)}>סה"כ לסניף</th>
            {columnTotals.map((t, j) => (
              <td key={j} className="cgrid-calc" style={bg(groupColor(storeGroups[j] ?? 0))}>{t}</td>
            ))}
            <td className="cgrid-calc cgrid-c-tot" style={bg(FILL.total)}>
              {columnTotals.reduce((a, b) => a + b, 0)}
            </td>
            <td className="cgrid-calc cgrid-c-cap" style={bg(FILL.cap)} />
            <td className="cgrid-calc cgrid-c-left" style={bg(FILL.left)} />
            <td className="cgrid-calc cgrid-c-max" style={bg(FILL.max)} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default ContainerGrid;
