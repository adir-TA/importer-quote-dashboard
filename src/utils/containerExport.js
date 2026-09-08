// ============================================
// CONTAINER EXPORTS
// ============================================
// Three outputs, matching the standalone tool:
//   1. the full grid as .xlsx
//   2. one page per branch (preview / print / .doc)
//   3. a "remaining" summary as .xlsx
//
// The original hand-rolled ~250 lines of raw OOXML and zipped it with a
// CDN copy of JSZip. exceljs is already a dependency here and produces the
// same workbook - same fills, RTL sheet, frozen header, landscape fit.

import {
  FILL, groupColor, num, rowTotal, rowRemaining, buildBranchPages,
} from './containerModel.js';
import { downloadBlob } from './helpers.js';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Escape text for the HTML-based outputs. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Strip characters Windows forbids in filenames. Product codes contain slashes. */
export function safeName(s) {
  return String(s ?? '').replace(/[\\/:*?"<>|]/g, '-').trim();
}

const solid = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + argb } });
const THIN = { style: 'thin', color: { argb: 'FFB0B7C0' } };
const BORDER = { top: THIN, left: THIN, bottom: THIN, right: THIN };

/** Column width from the longest value, within sensible bounds. */
function widthFor(values, min = 8, max = 34) {
  const longest = values.reduce((w, v) => Math.max(w, String(v ?? '').length), 0);
  return Math.min(Math.max(longest + 2, min), max);
}

// ============================================
// 1. FULL GRID
// ============================================
export async function buildGridWorkbook({ products, stores, storeGroups, qty, caps, limits, name, containerNo }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HA Tools';
  wb.created = new Date();
  // Written into the file's properties so a downloaded sheet still says which
  // container it belongs to once it is renamed or mailed on.
  wb.title = [name, containerNo && `מכולה ${containerNo}`].filter(Boolean).join(' — ');

  const ws = wb.addWorksheet('גיליון1', {
    views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToWidth: 1, fitToHeight: 0, fitToPage: true },
  });

  const header = ['מוצר', ...stores, 'סה"כ ארגזים', 'סה"כ במכולה', 'נותרים', "מקס' לסניף"];
  ws.addRow(header);

  products.forEach((product, i) => {
    const total = rowTotal(qty[i]);
    const left = rowRemaining(qty[i], caps[i]);
    ws.addRow([
      product,
      ...stores.map((_, j) => (qty[i][j] === '' || qty[i][j] == null ? null : num(qty[i][j]))),
      total,
      caps[i] === '' || caps[i] == null ? null : num(caps[i]),
      left === null ? null : left,
      limits[i] === '' || limits[i] == null ? null : num(limits[i]),
    ]);
  });

  const lastCol = header.length;
  const totalCol = stores.length + 2;

  // Header row
  const head = ws.getRow(1);
  head.height = 30;
  head.eachCell((cell, col) => {
    cell.font = { bold: true, size: 11 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER;
    if (col === 1) cell.fill = solid(FILL.name);
    else if (col <= stores.length + 1) cell.fill = solid(groupColor(storeGroups[col - 2] ?? 0));
    else if (col === totalCol) cell.fill = solid(FILL.total);
    else if (col === totalCol + 1) cell.fill = solid(FILL.cap);
    else if (col === totalCol + 2) cell.fill = solid(FILL.left);
    else cell.fill = solid(FILL.max);
  });

  // Body
  products.forEach((_, i) => {
    const row = ws.getRow(i + 2);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = BORDER;
      cell.alignment = col === 1
        ? { horizontal: 'right', vertical: 'middle' }
        : { horizontal: 'center', vertical: 'middle' };
      if (col === 1) { cell.fill = solid(FILL.name); cell.font = { bold: true, size: 11 }; }
      else if (col <= stores.length + 1) cell.fill = solid(groupColor(storeGroups[col - 2] ?? 0));
      else if (col === totalCol) { cell.fill = solid(FILL.total); cell.font = { bold: true }; }
      else if (col === totalCol + 1) cell.fill = solid(FILL.cap);
      else if (col === totalCol + 2) {
        cell.fill = solid(FILL.left);
        // Negative remaining is the one thing a reader must not miss
        if (typeof cell.value === 'number' && cell.value < 0) {
          cell.font = { bold: true, color: { argb: 'FFB42318' } };
        }
      } else cell.fill = solid(FILL.max);
    });
  });

  ws.columns.forEach((col, idx) => {
    if (idx === 0) col.width = widthFor(products, 18, 40);
    else if (idx <= stores.length) col.width = widthFor([stores[idx - 1]], 9, 18);
    else col.width = widthFor([header[idx]], 12, 16);
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lastCol } };

  return wb;
}

// ============================================
// 2. REMAINING SUMMARY
// ============================================
export async function buildRemainingWorkbook({ products, qty, caps, containerNo }) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HA Tools';

  const ws = wb.addWorksheet('נותרים', {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToWidth: 1, fitToHeight: 0, fitToPage: true },
  });

  ws.addRow(['מכולה ' + (containerNo || '')]);
  ws.mergeCells('A1:B1');
  const title = ws.getRow(1);
  title.height = 26;
  title.getCell(1).font = { bold: true, size: 14 };
  title.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  ws.addRow(['מוצר', 'נותרים']);
  const head = ws.getRow(2);
  head.eachCell(cell => {
    cell.font = { bold: true };
    cell.fill = solid(FILL.left);
    cell.border = BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  products.forEach((product, i) => {
    const left = rowRemaining(qty[i], caps[i]);
    const row = ws.addRow([product, left === null ? '—' : left]);
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = BORDER;
      cell.alignment = col === 1
        ? { horizontal: 'right', vertical: 'middle' }
        : { horizontal: 'center', vertical: 'middle' };
      if (col === 2 && typeof cell.value === 'number' && cell.value < 0) {
        cell.font = { bold: true, color: { argb: 'FFB42318' } };
      }
    });
  });

  ws.columns = [{ width: widthFor(products, 20, 46) }, { width: 12 }];
  return wb;
}

// ============================================
// 3. PER-BRANCH PAGES
// ============================================
// Two columns once a branch has more than this many lines, so a long list
// still fits one printed page.
const COLUMN_SPLIT_AT = 18;

const PAGE_CSS = `
  @page { size: A4 portrait; margin: 18mm 15mm; }
  body { font-family: "Assistant", "Segoe UI", Arial, sans-serif; color: #101828; direction: rtl; }
  h1 { font-size: 26pt; margin: 0 0 18pt; text-align: center; }
  p { font-size: 15pt; margin: 0 0 7pt; line-height: 1.45; }
  table.cols { width: 100%; border-collapse: collapse; }
  table.cols td { vertical-align: top; width: 50%; }
`;

/** The body HTML for one branch page. */
function pageBody(items) {
  const lines = items.map(it => `<p>${it.qty} ${esc(it.product)}</p>`);
  if (lines.length <= COLUMN_SPLIT_AT) return lines.join('');
  const half = Math.ceil(lines.length / 2);
  return '<table class="cols"><tr>' +
    `<td>${lines.slice(0, half).join('')}</td>` +
    `<td>${lines.slice(half).join('')}</td>` +
    '</tr></table>';
}

/** Pages ready to render in the preview, print, or Word. */
export function branchPages(payload, containerNo) {
  return buildBranchPages({ ...payload, containerNo })
    .map(pg => ({ ...pg, html: pageBody(pg.items) }));
}

/** A Word-openable .doc: HTML with the Office namespaces and hard page breaks. */
export function buildDocHtml(pages, title) {
  const body = pages.map((pg, i) =>
    (i ? '<br clear="all" style="mso-special-character:line-break;page-break-before:always">' : '') +
    `<h1>${esc(pg.title)}</h1>${pg.html}`
  ).join('');

  return '﻿<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
    'xmlns:w="urn:schemas-microsoft-com:office:word" dir="rtl" lang="he">' +
    `<head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<style>${PAGE_CSS}</style></head><body>${body}</body></html>`;
}

/** Standalone HTML for printing, one section per page. */
export function buildPrintHtml(pages, title) {
  const body = pages.map(pg =>
    `<section><h1>${esc(pg.title)}</h1>${pg.html}</section>`
  ).join('');

  return '<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">' +
    `<title>${esc(title)}</title><style>${PAGE_CSS}` +
    'section { break-after: page; page-break-after: always; }' +
    'section:last-child { break-after: auto; page-break-after: auto; }' +
    '</style></head><body>' + body + '</body></html>';
}

/**
 * Print without leaving the app: render into a hidden iframe and print that.
 * Using the app's own window would print the whole interface.
 */
export function printPages(pages, title) {
  const existing = document.getElementById('containerPrintFrame');
  if (existing) existing.remove();

  const frame = document.createElement('iframe');
  frame.id = 'containerPrintFrame';
  frame.setAttribute('style', 'position:fixed;inset:0;width:0;height:0;border:0;opacity:0');
  document.body.appendChild(frame);

  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(buildPrintHtml(pages, title));
  doc.close();

  const go = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
  if (doc.readyState === 'complete') setTimeout(go, 60);
  else frame.onload = () => setTimeout(go, 60);
}

// ============================================
// DOWNLOAD HELPERS
// ============================================
export async function downloadGridXlsx(payload, meta) {
  const wb = await buildGridWorkbook({ ...payload, ...meta });
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: XLSX_MIME }), `${meta.baseName}.xlsx`);
}

export async function downloadRemainingXlsx(payload, meta) {
  const wb = await buildRemainingWorkbook({ ...payload, ...meta });
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer], { type: XLSX_MIME }), `${meta.baseName}-נותרים.xlsx`);
}

export function downloadDoc(pages, meta) {
  const html = buildDocHtml(pages, meta.baseName);
  downloadBlob(new Blob([html], { type: 'application/msword' }), `${meta.baseName}.doc`);
}

export default {
  esc, safeName, branchPages, buildDocHtml, buildPrintHtml, printPages,
  buildGridWorkbook, buildRemainingWorkbook,
  downloadGridXlsx, downloadRemainingXlsx, downloadDoc,
};
