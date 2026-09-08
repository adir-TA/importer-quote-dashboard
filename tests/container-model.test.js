// ============================================
// CONTAINER MODEL TESTS
// ============================================
// Exercised against a fixture that mirrors a real exported backup: the same
// branches, groups, quantities, capacities and edge cases (no `limits` key,
// and one container saved with every branch excluded). Product names are
// generic so no commercial data lives in the repository.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  parseProducts, parseBranches, branchesToText, normalizeGroups,
  rowTotal, rowRemaining, columnTotal, overLimitCells, overCapacityRows,
  parseClipboardGrid, isGridPaste, applyPaste, cleanNumber,
  buildBranchPages, normalizePayload, resizeGrid, groupColor, num,
} from '../src/utils/containerModel.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backup = JSON.parse(fs.readFileSync(path.join(here, 'fixtures-containers.json'), 'utf8'));

let passed = 0, failed = 0;
function check(name, fn) {
  try { fn(); console.log(`✅ ${name}`); passed++; }
  catch (e) { console.error(`❌ ${name}\n   ${e.message}`); failed++; }
}
function eq(a, b, msg) {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg || 'mismatch'}\n   expected: ${B}\n   actual:   ${A}`);
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'expected truthy'); }

console.log('\n=== Branch / product parsing ===');

check('blank line starts a new group', () => {
  const { names, groups } = parseBranches('א\nב\n\nג\nד');
  eq(names, ['א', 'ב', 'ג', 'ד']);
  eq(groups, [0, 0, 1, 1]);
});

check('consecutive blank lines do not create empty groups', () => {
  const { names, groups } = parseBranches('א\n\n\n\nב');
  eq(names, ['א', 'ב']);
  eq(groups, [0, 1], 'three blank lines should still mean one boundary');
});

check('leading blank lines are ignored', () => {
  const { groups } = parseBranches('\n\nא\nב');
  eq(groups, [0, 0]);
});

check('branchesToText round-trips the real branch list', () => {
  const c = backup.containers[0];
  const text = branchesToText(c.stores, c.storeGroups);
  const back = parseBranches(text);
  eq(back.names, c.stores, 'names should survive');
  eq(back.groups, normalizeGroups(c.storeGroups), 'groups should survive');
});

check('the real draftStores parses to the stored structure', () => {
  const c = backup.containers[0];
  const { names, groups } = parseBranches(c.draftStores);
  eq(names, c.stores);
  eq(groups, c.storeGroups);
});

check('products keep their SKU codes and slashes verbatim', () => {
  const list = parseProducts('כוס קרמיקה 8211-1/8\nגליל כסוף 2005-3');
  eq(list, ['כוס קרמיקה 8211-1/8', 'גליל כסוף 2005-3']);
});

console.log('\n=== Derived values ===');

check('row totals sum every filled cell', () => {
  const c = backup.containers[0];
  const expected = c.qty[0].reduce((a, v) => a + (v === '' ? 0 : Number(v)), 0);
  eq(rowTotal(c.qty[0]), expected);
  eq(rowTotal(c.qty[0]), 43, 'the first row of the fixture totals 43');
});

check('remaining is null when no capacity is set', () => {
  eq(rowRemaining(['1', '2'], ''), null);
  eq(rowRemaining(['1', '2'], null), null);
  eq(rowRemaining(['1', '2'], '10'), 7);
});

check('no row in the real data exceeds its capacity', () => {
  backup.containers.forEach(c => {
    eq(overCapacityRows(c.qty, c.caps), [], `${c.name} should be within capacity`);
  });
});

check('over-capacity is detected when it happens', () => {
  eq(overCapacityRows([['5', '5']], ['9']), [0]);
  eq(rowRemaining(['5', '5'], '9'), -1);
});

check('column totals ignore blank cells', () => {
  const c = backup.containers[0];
  const expected = c.qty.reduce((a, row) => a + (row[0] === '' ? 0 : Number(row[0])), 0);
  eq(columnTotal(c.qty, 0), expected);
  eq(columnTotal(c.qty, 0), 28, 'the first branch column totals 28');
});

check('limits absent from v3 exports default to no limit', () => {
  const c = backup.containers[0];
  ok(!('limits' in c), 'fixture really should lack limits');
  const p = normalizePayload(c);
  eq(p.limits.length, c.products.length);
  eq(overLimitCells(p.qty, p.limits), [], 'no limits means nothing is over');
});

check('over-limit cells are found when a limit is set', () => {
  eq(overLimitCells([['3', '9']], ['5']), [{ row: 0, col: 1 }]);
});

console.log('\n=== Excel paste ===');

check('single cell is not treated as a grid paste', () => {
  ok(!isGridPaste('42'), 'a bare number should paste normally');
  ok(isGridPaste('1\t2'), 'tabs mean a grid');
  ok(isGridPaste('1\n2'), 'newlines mean a grid');
});

check('Excel CRLF and trailing newline are handled', () => {
  eq(parseClipboardGrid('1\t2\r\n3\t4\r\n'), [['1', '2'], ['3', '4']]);
});

check('paste writes into the grid at the anchor', () => {
  const r = applyPaste({
    grid: [['1', '2'], ['3', '4']],
    anchorRow: 0, anchorCol: 1,
    products: ['a', 'b'], branches: ['x', 'y'],
    qty: [['', ''], ['', '']], caps: ['', ''], limits: ['', ''],
  });
  eq(r.qty, [['1', '2'], ['3', '4']]);
  eq(r.report.filled, 4);
  eq(r.report.badCells, 0);
});

check('paste clips at the last column instead of overflowing', () => {
  const r = applyPaste({
    grid: [['1', '2', '3', '4', '5']],
    anchorRow: 0, anchorCol: 1,
    products: ['a'], branches: ['x', 'y'],
    qty: [['', '']], caps: [''], limits: [''],
  });
  // columns: 1,2 = branches, 3 = capacity, 4 = max per branch, 5+ = clipped
  eq(r.qty, [['1', '2']]);
  eq(r.caps, ['3']);
  eq(r.limits, ['4']);
  eq(r.report.skippedCols, 1);
});

check('a paste anchored on the max column lands there', () => {
  const r = applyPaste({
    grid: [['7'], ['8']],
    anchorRow: 0, anchorCol: 5, // 0 name, 1-3 branches, 4 capacity, 5 max
    products: ['a', 'b'], branches: ['x', 'y', 'z'],
    qty: [['', '', ''], ['', '', '']], caps: ['', ''], limits: ['', ''],
  });
  eq(r.limits, ['7', '8']);
  eq(r.caps, ['', '']);
  eq(r.report.skippedCols, 0);
});

check('paste does not grow the table unless names are included', () => {
  const r = applyPaste({
    grid: [['1'], ['2'], ['3']],
    anchorRow: 0, anchorCol: 1,
    products: ['a'], branches: ['x'],
    qty: [['']], caps: [''], limits: [''],
  });
  eq(r.products.length, 1, 'row count must not change');
  eq(r.report.skippedRows, 2);
});

check('pasting names appends rows', () => {
  const r = applyPaste({
    grid: [['a'], ['b'], ['c']],
    anchorRow: 0, anchorCol: 0,
    products: ['a'], branches: ['x'],
    qty: [['']], caps: [''], limits: [''],
  });
  eq(r.products, ['a', 'b', 'c']);
  eq(r.report.addedRows, 2);
  eq(r.qty.length, 3);
  eq(r.qty[1], ['']);
});

check('non-numeric cells are skipped and counted, not written as zero', () => {
  const r = applyPaste({
    grid: [['abc', '5']],
    anchorRow: 0, anchorCol: 1,
    products: ['a'], branches: ['x', 'y'],
    qty: [['9', '9']], caps: [''], limits: [''],
  });
  eq(r.qty, [['9', '5']], 'the junk cell must be left alone');
  eq(r.report.badCells, 1);
});

check('an empty pasted cell clears its target', () => {
  const r = applyPaste({
    grid: [['', '5']],
    anchorRow: 0, anchorCol: 1,
    products: ['a'], branches: ['x', 'y'],
    qty: [['9', '9']], caps: [''], limits: [''],
  });
  eq(r.qty, [['', '5']]);
});

check('thousands separators from Excel are accepted', () => {
  eq(cleanNumber('1,200'), '1200');
  eq(cleanNumber(' 45 '), '45');
  eq(cleanNumber('12.5'), '12.5');
  eq(cleanNumber('abc'), null);
  eq(cleanNumber(''), '');
});

check('paste never mutates its inputs', () => {
  const qty = [['1']];
  const products = ['a'];
  applyPaste({
    grid: [['9']], anchorRow: 0, anchorCol: 1,
    products, branches: ['x'], qty, caps: [''], limits: [''],
  });
  eq(qty, [['1']], 'source qty must be untouched');
  eq(products, ['a'], 'source products must be untouched');
});

console.log('\n=== Branch pages ===');

check('a branch with no quantities produces no page', () => {
  const c = backup.containers[1];
  const p = normalizePayload(c);
  const pages = buildBranchPages({ ...p, containerNo: c.containerNo });
  const names = pages.map(x => x.branch);
  ok(!names.includes('אתא'), 'אתא receives nothing and must not get a page');
  ok(names.includes('אור עקיבא'), 'אור עקיבא does receive stock');
});

check('page titles carry the container number', () => {
  const c = backup.containers[1];
  const p = normalizePayload(c);
  const pages = buildBranchPages({ ...p, containerNo: c.containerNo });
  eq(pages[0].title, pages[0].branch + ' מכולה 288');
});

check('pages list only products with a positive quantity', () => {
  const pages = buildBranchPages({
    products: ['a', 'b', 'c'], stores: ['x'],
    qty: [['2'], [''], ['0']], docExclude: [], containerNo: '1',
  });
  eq(pages[0].items, [{ qty: 2, product: 'a' }]);
});

console.log('\n=== Payload normalisation ===');

check('the all-excluded state is repaired', () => {
  const c = backup.containers[0];
  eq(c.docExclude.length, c.stores.length, 'fixture really is fully excluded');
  const p = normalizePayload(c);
  eq(p.docExclude, [], 'every branch excluded is never intended');
  ok(buildBranchPages({ ...p, containerNo: c.containerNo }).length > 0,
     'generation must produce pages after repair');
});

check('both real containers normalise to a rectangular grid', () => {
  backup.containers.forEach(c => {
    const p = normalizePayload(c);
    eq(p.qty.length, p.products.length, `${c.name} row count`);
    p.qty.forEach(row => eq(row.length, p.stores.length, `${c.name} column count`));
    eq(p.caps.length, p.products.length);
    eq(p.limits.length, p.products.length);
  });
});

check('a ragged stored grid is squared off', () => {
  const p = normalizePayload({ products: ['a', 'b'], stores: ['x', 'y'], qty: [['1']] });
  eq(p.qty, [['1', ''], ['', '']]);
});

console.log('\n=== Resize keeps data on the right cells ===');

check('reordering branches moves quantities with them', () => {
  const r = resizeGrid({
    products: ['p1'], branches: ['y', 'x'],
    prevProducts: ['p1'], prevBranches: ['x', 'y'],
    qty: [['1', '2']], caps: [''], limits: [''],
  });
  eq(r.qty, [['2', '1']], 'x keeps 1 and y keeps 2 after the swap');
});

check('an inserted product starts empty instead of inheriting the row below', () => {
  const r = resizeGrid({
    products: ['new', 'a', 'b'],
    branches: ['x', 'y'],
    prevProducts: ['a', 'b'],
    prevBranches: ['x', 'y'],
    qty: [['1', '2'], ['3', '4']],
    caps: ['10', '20'],
    limits: ['5', '6'],
  });
  eq(r.qty, [['', ''], ['1', '2'], ['3', '4']]);
  eq(r.caps, ['', '10', '20']);
  eq(r.limits, ['', '5', '6']);
});

check('a product renamed in place keeps its numbers', () => {
  const r = resizeGrid({
    products: ['a', 'b-fixed'],
    branches: ['x', 'y'],
    prevProducts: ['a', 'b'],
    prevBranches: ['x', 'y'],
    qty: [['1', '2'], ['3', '4']],
    caps: ['10', '20'],
    limits: ['5', '6'],
  });
  eq(r.qty, [['1', '2'], ['3', '4']]);
  eq(r.caps, ['10', '20']);
  eq(r.limits, ['5', '6']);
});

check('an inserted branch starts empty instead of inheriting its neighbour', () => {
  const r = resizeGrid({
    products: ['a'],
    branches: ['new', 'x', 'y'],
    prevProducts: ['a'],
    prevBranches: ['x', 'y'],
    qty: [['1', '2']],
    caps: ['10'],
    limits: ['5'],
  });
  eq(r.qty, [['', '1', '2']]);
});

check('removing a product keeps the others intact', () => {
  const r = resizeGrid({
    products: ['p1', 'p3'], branches: ['x'],
    prevProducts: ['p1', 'p2', 'p3'], prevBranches: ['x'],
    qty: [['1'], ['2'], ['3']], caps: ['10', '20', '30'], limits: ['', '', ''],
  });
  eq(r.qty, [['1'], ['3']]);
  eq(r.caps, ['10', '30']);
});

console.log('\n=== Colours ===');

check('group colours match the original palette and cycle', () => {
  eq(groupColor(0), 'C5E0B4');
  eq(groupColor(4), 'D9E2F3');
  eq(groupColor(9), 'C5E0B4', 'the palette cycles after nine groups');
});

check('num() tolerates junk without throwing', () => {
  eq(num(''), 0); eq(num(null), 0); eq(num('abc'), 0); eq(num('12'), 12);
});

console.log('\n============================================');
console.log(`✅ PASSED: ${passed}`);
console.log(`❌ FAILED: ${failed}`);
console.log('============================================');
process.exit(failed ? 1 : 0);
