// Guards for the shared print pipeline (PrintStage → printPdf → A4 pages).
//
// The geometry itself is unit-tested in pdfLayout.test.mjs; what is left to pin
// is the plumbing that is easy to undo by accident:
//   - the 週末 table splits into page-sized chunks instead of shrinking,
//   - the 服務 download names carry the shown month,
//   - the meetings-page PDF exports refuse anything outside `.print-stage`,
//   - the pages' PDF branches actually call that guard (JPG/複製圖片 keep using
//     the live card, which is the intended difference).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { WEEKEND_PRINT_ROWS_PER_PAGE, weekendPrintChunks } from './weekendPrint.mjs';
import { serviceExportFilename } from './services.mjs';

/* ===================== weekendPrintChunks ===================== */

test('週末 rows split into page-sized chunks with the header repeated per chunk', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({ _id: i }));
  const chunks = weekendPrintChunks(rows);
  assert.equal(chunks.length, Math.ceil(40 / WEEKEND_PRINT_ROWS_PER_PAGE));
  assert.equal(chunks[0].length, WEEKEND_PRINT_ROWS_PER_PAGE);
  // Every row appears exactly once, in order: a split at a row boundary never
  // duplicates or drops a row.
  assert.deepEqual(chunks.flat().map((row) => row._id), rows.map((row) => row._id));
});

test('週末 chunks handle an exactly-full page and an empty table', () => {
  const exact = Array.from({ length: WEEKEND_PRINT_ROWS_PER_PAGE }, (_, i) => ({ _id: i }));
  assert.equal(weekendPrintChunks(exact).length, 1, 'a full page must not spill a second chunk');
  assert.deepEqual(weekendPrintChunks([]), []);
  assert.deepEqual(weekendPrintChunks(undefined), []);
  // A row count that lands one past the boundary starts a real second page.
  assert.equal(weekendPrintChunks([...exact, { _id: 'extra' }]).length, 2);
});

test('週末 chunks honour an explicit page size and never divide by zero', () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ _id: i }));
  assert.deepEqual(weekendPrintChunks(rows, 2).map((chunk) => chunk.length), [2, 2, 1]);
  assert.equal(weekendPrintChunks(rows, 0).length, 5);
  assert.equal(weekendPrintChunks(rows, -3).length, 5);
});

/* ===================== serviceExportFilename ===================== */

test('服務 download names carry the shown month', () => {
  assert.equal(serviceExportFilename('2026-11', 'pdf'), '服務_2026年11月.pdf');
  assert.equal(serviceExportFilename('2026-01', 'jpg'), '服務_2026年1月.jpg');
  assert.equal(serviceExportFilename('2026-12', 'pdf'), '服務_2026年12月.pdf');
});

test('服務 download names fall back for a missing or malformed month', () => {
  assert.equal(serviceExportFilename(undefined, 'pdf'), '服務.pdf');
  assert.equal(serviceExportFilename('2026', 'pdf'), '服務.pdf');
  assert.equal(serviceExportFilename('', 'jpg'), '服務.jpg');
});

/* ===================== print-stage plumbing (source guards) ===================== */

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('the meetings page PDF branches refuse nodes outside a print stage', () => {
  const file = source('./printPdf.js');
  assert.match(file, /export const PRINT_STAGE_SELECTOR = '\.print-stage'/);
  assert.match(file, /node\.closest\?\.\(PRINT_STAGE_SELECTOR\)/);
  assert.match(file, /PDF 匯出必須使用列印區/);
  // And they route through the one shared capture entry point.
  assert.match(file, /exportCapturesPdf\(ensurePrintStage\(nodes\)/);
});

test('the meetings page PDF branches capture the print stage, not the live card', () => {
  const file = source('../components/MeetingsPage.js');
  // Both 週中 and 週末 PDF go through exportStagePdf with the stage ref.
  const stageCalls = [...file.matchAll(/exportStagePdf\((\w+)\?\.current/g)].map((m) => m[1]);
  assert.deepEqual(stageCalls.sort(), ['pdfNodesRef', 'pdfNodesRef'].sort());
  assert.match(file, /exportStagePdf\(pdfNodesRef\?\.current, \{\s*filename: getMidweekExportFilename\(week, 'pdf'\)/);
  assert.match(file, /exportStagePdf\(pdfNodesRef\?\.current, \{\s*filename: getWeekendExportFilename\(rows, 'pdf', '週末聚會'\)/);
  // The 週中 stage exists on the page and renders a read-only card.
  assert.match(file, /<PrintStage nodesRef=\{midweekPdfNodesRef\}>/);
  assert.match(file, /<PrintStage nodesRef=\{midweekPdfNodesRef\}>[\s\S]*?editMode=\{false\}[\s\S]*?<\/PrintStage>/);
  // The old popup / direct-to-JPEG-PDF path must not come back.
  assert.doesNotMatch(file, /window\.open\([^)]*\)\.print\(/);
});

test('週末 renders its print chunks inside a PrintStage', () => {
  const file = source('../components/WeekendView.js');
  assert.match(file, /weekendPrintChunks\(rows\)/);
  assert.match(file, /<PrintStage nodesRef=\{printNodesRef\} className="print-stage--weekend">/);
  assert.match(file, /<WeekendPrintTable[\s\S]*?rows=\{chunk\}/);
  // The live table (and its mobile cards) stay as they are; only the stage is new.
  assert.match(file, /<div className="wk-cards">/);
});

test('服務 exports render every category from the month payload into a PrintStage', () => {
  const page = source('../components/ServicesPage.js');
  assert.match(page, /const payload = await request\(`\/api\/services\/month\?month=\$\{month\}`\)/);
  assert.match(page, /<PrintStage nodesRef=\{exportNodesRef\} className="print-stage--services">/);
  assert.match(page, /<ServicesPrintSheet\s+month=\{exportJob\.month\}\s+categories=\{categories\}\s+monthData=\{exportJob\.data\}/);
  assert.match(page, /serviceExportFilename\(exportJob\.month, 'pdf'\)/);
  assert.match(page, /serviceExportFilename\(exportJob\.month, 'jpg'\)/);
  // Read-only: the sheet itself never renders a control.
  const sheet = source('../components/ServicesPrint.js');
  assert.doesNotMatch(sheet, /<button/);
  assert.doesNotMatch(sheet, /<input|<textarea|<select/);
});

test('the shared stage keeps the old mw-pdf-captures hook alive', () => {
  const stage = source('../components/PrintStage.js');
  assert.match(stage, /className = ''/);
  const importPage = source('../components/ImportPage.js');
  assert.match(importPage, /<PrintStage className="mw-pdf-captures">/);
});
