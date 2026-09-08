// ============================================
// CONTAINER LOAD PLANNER - PURE MODEL
// ============================================
// All grid logic lives here, free of React and of the DOM, so the fiddly
// parts (group parsing, the Excel paste, the derived columns) can be tested
// directly. Ported from the standalone HA Containers tool; behaviour is
// intentionally identical.

// Group colours, indexed by group number and cycling. Unchanged from the
// original tool - these are the colours that reach both the on-screen grid
// and the generated .xlsx, so they are part of the output, not decoration.
export const PALETTE = [
  'C5E0B4', 'F8CBAD', '8EAADB', 'FFF2CC', 'D9E2F3',
  'F4B183', 'A9D18E', 'FFD966', 'D0CECE',
];

// Fixed fills for the derived columns
export const FILL = {
  name: 'EDEDED',
  total: 'A9D18E',
  cap: 'BBDEFB',
  left: 'FFD966',
  max: 'E2D9F3',
};

/** Colour for a group index. */
export function groupColor(groupIndex) {
  return PALETTE[groupIndex % PALETTE.length];
}

/** The default branch list, used to seed a new account. */
export const DEFAULT_BRANCH_GROUPS = [
  ['אור עקיבא', 'ראשון לציון', 'עפולה', 'נהריה'],
  ['אתא', 'הדר', 'פתח תקווה'],
  ['כפר סבא', 'בני ברק', 'חדרה', 'ראש העין'],
  ['חריש', 'טירה', 'הרצליה'],
  ['בן פרדס חנה', 'יעקב חולון', 'ציון הבוכרי', 'ברמו', 'גל חדד'],
];

/** Parse a number out of a cell, tolerating stray characters. Returns 0 for junk. */
export function num(v) {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** True when a cell actually holds something. */
export function hasValue(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

/**
 * Normalise a pasted value to a plain number string.
 * Returns null when it is not numeric, so the caller can count and report
 * skipped cells rather than silently writing zeros.
 */
export function cleanNumber(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return '';
  // Strip thousands separators and any currency/unit noise around the number
  const stripped = s.replace(/[\s, ]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(stripped)) return null;
  return stripped;
}

// ============================================
// PRODUCTS / BRANCHES TEXT PARSING
// ============================================

/** One product per line; blank lines ignored. */
export function parseProducts(text) {
  return String(text ?? '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);
}

/**
 * Parse the branch textarea.
 * A blank line starts a new colour group. Consecutive blank lines do not
 * create empty groups, and group numbers are renumbered from zero so the
 * palette is always used from its start.
 */
export function parseBranches(text) {
  const names = [];
  const raw = [];
  let group = 0;
  let started = false;

  String(text ?? '').split('\n').forEach(line => {
    const s = line.trim();
    if (!s) {
      if (started) group += 1;
      return;
    }
    names.push(s);
    raw.push(group);
    started = true;
  });

  // Renumber so groups run 0,1,2… even if blank lines were doubled up
  const seen = {};
  let next = 0;
  raw.forEach(g => { if (seen[g] === undefined) seen[g] = next++; });

  return { names, groups: raw.map(g => seen[g]) };
}

/** Inverse of parseBranches: render names back to text with blank-line separators. */
export function branchesToText(names, groups) {
  let out = '';
  let prev = null;
  names.forEach((name, j) => {
    if (prev !== null && groups[j] !== prev) out += '\n';
    out += name + '\n';
    prev = groups[j];
  });
  return out.trim();
}

/** Renumber groups so they are contiguous from zero. */
export function normalizeGroups(groups) {
  const seen = {};
  let next = 0;
  return groups.map(g => {
    if (seen[g] === undefined) seen[g] = next++;
    return seen[g];
  });
}

// ============================================
// DERIVED VALUES
// ============================================

/** Total boxes allocated for a product row. */
export function rowTotal(qtyRow) {
  return (qtyRow || []).reduce((a, v) => a + num(v), 0);
}

/**
 * Remaining for a row: capacity minus what has been allocated.
 * Returns null when no capacity is set, which renders as an em dash rather
 * than a misleading zero.
 */
export function rowRemaining(qtyRow, cap) {
  if (!hasValue(cap)) return null;
  return num(cap) - rowTotal(qtyRow);
}

/** Total boxes going to one branch, across every product. */
export function columnTotal(qty, branchIndex) {
  return qty.reduce((a, row) => a + num(row[branchIndex]), 0);
}

/** True when a cell exceeds the row's max-per-branch limit. */
export function isOverLimit(value, limit) {
  if (!hasValue(limit)) return false;
  return num(value) > num(limit);
}

/** Every cell that exceeds its row limit. */
export function overLimitCells(qty, limits) {
  const out = [];
  qty.forEach((row, i) => {
    if (!hasValue(limits[i])) return;
    row.forEach((v, j) => {
      if (isOverLimit(v, limits[i])) out.push({ row: i, col: j });
    });
  });
  return out;
}

/** Rows allocated beyond their stated container capacity. */
export function overCapacityRows(qty, caps) {
  const out = [];
  qty.forEach((row, i) => {
    const left = rowRemaining(row, caps[i]);
    if (left !== null && left < 0) out.push(i);
  });
  return out;
}

// ============================================
// EXCEL PASTE
// ============================================

/** Split clipboard text into a grid. Excel gives tab-separated, CRLF rows. */
export function parseClipboardGrid(text) {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n+$/, '')       // trailing newline Excel always appends
    .split('\n')
    .map(line => line.split('\t'));
}

/** A single cell with no tabs or newlines pastes normally, not as a grid. */
export function isGridPaste(text) {
  return /[\t\n\r]/.test(String(text ?? ''));
}

/**
 * Apply a pasted grid at an anchor cell.
 *
 * Column 0 is the product name, 1..n are branches, n+1 is capacity.
 * Pasting into the name column may append rows; pasting anywhere else is
 * clipped to the existing table so a stray paste cannot silently grow it.
 *
 * Pure: returns new arrays plus a report, and never mutates its input.
 */
export function applyPaste({ grid, anchorRow, anchorCol, products, branches, qty, caps, limits }) {
  const nextProducts = [...products];
  const nextQty = qty.map(r => [...r]);
  const nextCaps = [...caps];
  const nextLimits = [...limits];

  // 0 name, 1..n branches, n+1 capacity, n+2 max per branch
  const capCol = branches.length + 1;
  const limitCol = branches.length + 2;
  const lastCol = limitCol;
  const pastesNames = anchorCol === 0;

  let addedRows = 0;
  if (pastesNames) {
    const needed = anchorRow + grid.length - nextProducts.length;
    for (let k = 0; k < needed; k++) {
      nextProducts.push('');
      nextQty.push(branches.map(() => ''));
      nextCaps.push('');
      nextLimits.push('');
      addedRows++;
    }
  }

  let filled = 0;
  let skippedRows = 0;
  let skippedCols = 0;
  let badCells = 0;

  grid.forEach((line, ri) => {
    const i = anchorRow + ri;
    if (i >= nextProducts.length) { skippedRows++; return; }

    line.forEach((rawValue, ci) => {
      const c = anchorCol + ci;
      if (c > lastCol) { skippedCols++; return; }

      const v = String(rawValue ?? '').trim();

      if (c === 0) {
        // Product names paste verbatim - they carry SKU codes and slashes
        if (v !== '') { nextProducts[i] = v; filled++; }
        return;
      }

      if (v === '') {
        // An empty source cell clears the target
        if (c === capCol) nextCaps[i] = '';
        else if (c === limitCol) nextLimits[i] = '';
        else nextQty[i][c - 1] = '';
        filled++;
        return;
      }

      const n = cleanNumber(v);
      if (n === null) { badCells++; return; }

      if (c === capCol) nextCaps[i] = n;
      else if (c === limitCol) nextLimits[i] = n;
      else nextQty[i][c - 1] = n;
      filled++;
    });
  });

  return {
    products: nextProducts,
    qty: nextQty,
    caps: nextCaps,
    limits: nextLimits,
    report: { filled, addedRows, skippedRows, skippedCols, badCells },
  };
}

// ============================================
// PER-BRANCH PAGES (Word / print / preview)
// ============================================

/** Branches excluded from the generated pages. */
export function isBranchIncluded(name, docExclude) {
  return !(docExclude || []).includes(name);
}

/**
 * Build one page per branch: every product it receives, with quantities.
 * A branch with nothing allocated produces no page even if it is selected.
 */
export function buildBranchPages({ products, stores, qty, docExclude, containerNo }) {
  const suffix = ' מכולה' + (containerNo ? ' ' + containerNo : '');
  const pages = [];

  (stores || []).forEach((branch, j) => {
    if (!isBranchIncluded(branch, docExclude)) return;

    const items = [];
    products.forEach((product, i) => {
      const v = num(qty[i]?.[j]);
      if (v > 0) items.push({ qty: v, product });
    });

    if (!items.length) return;
    pages.push({ branch, title: branch + suffix, items });
  });

  return pages;
}

// ============================================
// CONTAINER RECORD
// ============================================

/** An empty container payload. */
export function emptyPayload() {
  return {
    products: [],
    stores: [],
    storeGroups: [],
    qty: [],
    caps: [],
    limits: [],
    docExclude: [],
    draftProducts: '',
    draftStores: '',
  };
}

/**
 * Coerce any stored or imported payload into the full shape, filling in
 * fields that older exports omit (`limits` is absent from v3 exports).
 */
export function normalizePayload(raw) {
  const p = raw || {};
  const products = Array.isArray(p.products) ? p.products : [];
  const stores = Array.isArray(p.stores) ? p.stores : [];

  const storeGroups = Array.isArray(p.storeGroups) && p.storeGroups.length === stores.length
    ? normalizeGroups(p.storeGroups)
    : stores.map(() => 0);

  const qty = products.map((_, i) => {
    const row = Array.isArray(p.qty?.[i]) ? p.qty[i] : [];
    return stores.map((__, j) => (row[j] ?? ''));
  });

  let docExclude = Array.isArray(p.docExclude) ? p.docExclude.filter(n => stores.includes(n)) : [];
  // Every branch excluded is never what anyone means - it makes generation
  // fail with "no branch selected" and forces re-ticking all of them. One
  // real export was saved in exactly that state.
  if (stores.length > 0 && docExclude.length === stores.length) docExclude = [];

  return {
    products,
    stores,
    storeGroups,
    qty,
    caps: products.map((_, i) => p.caps?.[i] ?? ''),
    limits: products.map((_, i) => p.limits?.[i] ?? ''),
    docExclude,
    draftProducts: p.draftProducts !== undefined ? p.draftProducts : products.join('\n'),
    draftStores: p.draftStores !== undefined ? p.draftStores : branchesToText(stores, storeGroups),
  };
}

/**
 * Slots whose previous occupant disappeared from the list entirely - the
 * signature of an edit in place (a typo fixed, an SKU rewritten), where
 * matching by position is what keeps the row's numbers attached to it.
 */
function renamedSlots(prev, next) {
  const kept = new Set(next);
  const slots = new Set();
  prev.forEach((name, i) => { if (!kept.has(name)) slots.add(i); });
  return slots;
}

/** Resize the grid to match a new product / branch list, keeping what overlaps. */
export function resizeGrid({ products, branches, prevProducts, prevBranches, qty, caps, limits }) {
  const prevIndexOfProduct = new Map(prevProducts.map((p, i) => [p, i]));
  const prevIndexOfBranch = new Map(prevBranches.map((b, j) => [b, j]));

  // A name still on the list keeps its own numbers wherever it moved to. A new
  // name only inherits the slot it landed in when that slot's old occupant is
  // gone as well; otherwise it is an insertion, and inheriting would hand it
  // the quantities of the row it pushed down.
  const renamedProducts = renamedSlots(prevProducts, products);
  const renamedBranches = renamedSlots(prevBranches, branches);

  const sourceRow = (product, i) => {
    if (prevIndexOfProduct.has(product)) return prevIndexOfProduct.get(product);
    return renamedProducts.has(i) ? i : -1;
  };
  const sourceCol = (branch, j) => {
    if (prevIndexOfBranch.has(branch)) return prevIndexOfBranch.get(branch);
    return renamedBranches.has(j) ? j : -1;
  };

  const nextQty = products.map((product, i) => {
    const pi = sourceRow(product, i);
    return branches.map((branch, j) => {
      const bj = sourceCol(branch, j);
      if (pi < 0 || bj < 0) return '';
      return qty[pi]?.[bj] ?? '';
    });
  });

  const carry = (arr) => products.map((product, i) => {
    const pi = sourceRow(product, i);
    return pi < 0 ? '' : (arr[pi] ?? '');
  });

  return { qty: nextQty, caps: carry(caps), limits: carry(limits) };
}

export default {
  PALETTE, FILL, groupColor, DEFAULT_BRANCH_GROUPS,
  num, hasValue, cleanNumber,
  parseProducts, parseBranches, branchesToText, normalizeGroups,
  rowTotal, rowRemaining, columnTotal, isOverLimit, overLimitCells, overCapacityRows,
  parseClipboardGrid, isGridPaste, applyPaste,
  isBranchIncluded, buildBranchPages,
  emptyPayload, normalizePayload, resizeGrid,
};
