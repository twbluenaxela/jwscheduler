// The single-source guard for the print/PDF pipeline.
//
// `app/lib/printPdf.js` is the only module allowed to turn DOM into images or
// images into PDF bytes, so the app cannot grow a second implementation of the
// same export (which is exactly how the phone-vs-desktop PDF drift happened the
// first time). This test scans the sources and fails if anything else:
//   - imports `html-to-image`            (a second capture implementation),
//   - imports `pdfWriter.mjs`            (a second PDF writer),
//   - touches `window.print` / `window.open` (a second print path),
//   - defines a `*Pdf*Blob` helper       (a second "images → PDF" builder).
//
// Excluded: the pipeline itself and its two low-level helpers, the tests, the
// dev preview, and the fixture routes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..');

// The only files allowed to know about html-to-image / the PDF byte writer.
const EXEMPT = new Set([
  path.join(APP, 'lib', 'printPdf.js'),
  path.join(APP, 'lib', 'pdfWriter.mjs'),
  path.join(APP, 'lib', 'pdfLayout.mjs'),
]);

const SKIP_DIRS = new Set(['node_modules', '.next', 'dev-preview', 'test-fixtures']);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else if (/\.(js|mjs)$/.test(entry.name) && !/\.test\.mjs$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(APP).filter((file) => !EXEMPT.has(file));
const rel = (file) => path.relative(APP, file).split(path.sep).join('/');

// Comments in this repo quote the very strings that are banned (the pipeline's
// own docs explain what used to be done), so strip them before scanning.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const RULES = [
  {
    name: "imports html-to-image (capture lives in printPdf.js)",
    test: (code) => /from\s+['"]html-to-image['"]|import\(\s*['"]html-to-image['"]\s*\)/.test(code),
  },
  {
    name: 'imports pdfWriter.mjs (PDF bytes live in printPdf.js)',
    test: (code) => /from\s+['"][^'"]*pdfWriter\.mjs['"]/.test(code),
  },
  {
    name: 'opens its own print path (window.print / window.open)',
    test: (code) => /window\.print\s*\(/.test(code) || /window\.open\s*\(/.test(code),
  },
  {
    name: 'defines its own *Pdf*Blob helper',
    test: (code) => /function\s+\w*Pdf\w*Blob\s*\(/.test(code),
  },
];

test('no module outside printPdf.js captures the DOM or builds a PDF', () => {
  const violations = [];
  for (const file of files) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const rule of RULES) {
      if (rule.test(code)) violations.push(`${rel(file)} — ${rule.name}`);
    }
  }
  assert.deepEqual(violations, [], `second print/PDF implementation:\n${violations.join('\n')}`);
});

test('the guard actually scans the app and knows the pipeline file', () => {
  // A silently-empty file list would make the test above vacuous.
  assert.ok(files.length > 20, `only ${files.length} files scanned`);
  assert.ok(files.some((file) => file.endsWith(path.join('components', 'MeetingsPage.js'))));
  assert.ok(files.some((file) => file.endsWith(path.join('lib', 'midweekExport.js'))));
  // And the pipeline itself is exempt, or the rule would flag the real one.
  assert.ok(EXEMPT.has(path.join(APP, 'lib', 'printPdf.js')));
});

test('every page-level PDF export goes through printPdf.js', () => {
  const source = (p) => readFileSync(path.join(APP, p), 'utf8');
  // 匯出 page: per-week PDF, the 版面 grid, and 列印 all call the pipeline.
  const importPage = source('components/ImportPage.js');
  assert.match(importPage, /import \{ exportCapturesPdf, printCaptures \} from '\.\.\/lib\/printPdf'/);
  assert.equal([...importPage.matchAll(/exportCapturesPdf\(/g)].length, 2);
  assert.match(importPage, /printCaptures\(exportPdfNodes\(\)\)/);
  // 匯出 page's PrintStage (the .mw-pdf-captures hook is kept for the CSS).
  assert.match(importPage, /<PrintStage className="mw-pdf-captures">/);
  // 週中 / 週末: the stage variants.
  const meetings = source('components/MeetingsPage.js');
  assert.match(meetings, /import \{ copyNodeImageToClipboard, downloadNodeImage, exportStagePdf \} from '\.\.\/lib\/printPdf'/);
  assert.equal([...meetings.matchAll(/exportStagePdf\(pdfNodesRef\?\.current/g)].length, 2);
  // 服務.
  assert.match(source('components/ServicesPage.js'), /exportCapturesPdf\(nodes, \{/);
  // 指派分布.
  assert.match(source('components/AssignmentHeatmap.js'), /exportCapturesPdf\(\[node\], \{/);
  // 書刊 清點 (S-28) prints through the shared window helper.
  assert.match(source('components/literature/CountSheet.js'), /printNodes\(\[printAreaRef\.current\]/);
});
