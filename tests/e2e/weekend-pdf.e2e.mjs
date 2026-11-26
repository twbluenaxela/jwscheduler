// End-to-end guard for the 週末 PDF export.
//
// The 週末 PDF used to screenshot the live `.wk-wrap`, so on a phone it captured
// the card list (the table is hidden at ≤720px) and in edit mode it carried the
// edit controls. It now captures an off-screen PrintStage that always renders the
// DESKTOP table, one page-sized chunk per page with the header repeated.
//
// This test renders the fixture route at a phone and a desktop size, freezes the
// clock inside the fixture's service year, asserts the stage geometry, and then
// downloads the real PDF and inspects its bytes.
//
//   npm run test:e2e
//
// Set BASE_URL to test an already-running server instead of spawning `next dev`.

import assert from 'node:assert/strict';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

import { weekendPrintChunks } from '../../app/lib/weekendPrint.mjs';
import { A4_PT, MARGIN } from '../../app/lib/pdfLayout.mjs';
import {
  FIXTURE_NOW,
  fixtureWeekendGetAssign,
  weekendFixtureRows,
} from '../../app/test-fixtures/weekend-pdf/fixtureRows.mjs';
import {
  ARTIFACTS,
  assertCleanTopBand,
  assertImageRatios,
  captureBoxFailures,
  captureNodePng,
  decodePng,
  ensureArtifacts,
  prepareStageForCapture,
  readPdf,
  startDevServer,
} from './helpers.mjs';

const FIXTURE_PATH = '/test-fixtures/weekend-pdf';
const STAGE_WIDTH = 960;
const ROWS = weekendFixtureRows();
const CHUNKS = weekendPrintChunks(ROWS);

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
];

let server;
let baseUrl;
let browser;

// Freezes `new Date()` / Date.now() at the fixture's service year so every "M/D"
// date resolves into it. Without this, December runs would resolve the year's
// earlier dates to next year and WeekendView's year gate would empty the table.
// Each page must hold its chunk without being shrunk further: a capture wider
// than the text column is scaled to the column, so its printed height is
// (height/width) × the column width and has to fit the printable height. Raising
// WEEKEND_PRINT_ROWS_PER_PAGE past this point silently shrinks the type instead
// of adding a page, which is the bug this export exists to avoid.
const COLUMN_W = A4_PT.w - 2 * MARGIN;
const PRINTABLE_H = A4_PT.h - 2 * MARGIN;
const MAX_CAPTURE_ASPECT = PRINTABLE_H / COLUMN_W;

function freezeClock(iso) {
  const fixed = new Date(iso).getTime();
  const RealDate = Date;
  class FixedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed);
      else super(...args);
    }

    static now() {
      return fixed;
    }
  }
  globalThis.Date = FixedDate;
}

before(async () => {
  ensureArtifacts();
  const started = await startDevServer(FIXTURE_PATH);
  baseUrl = started.baseUrl;
  server = started.stop;
  browser = await chromium.launch();
}, { timeout: 180_000 });

after(async () => {
  await browser?.close();
  server?.();
});

/* ===================== DOM geometry ===================== */

// Runs in the page: returns every symptom instead of throwing, so one broken
// chunk reports everything wrong with it.
function inspectStage(stageWidth) {
  const out = [];
  const stage = document.querySelector('.print-stage--weekend');
  if (!stage) return ['no .print-stage--weekend'];
  const stageRect = stage.getBoundingClientRect();
  if (Math.abs(stageRect.width - stageWidth) > 1) {
    out.push(`stage width ${stageRect.width} != ${stageWidth}`);
  }

  const chunks = [...stage.children];
  if (!chunks.length) out.push('stage has no captures');
  chunks.forEach((chunk, index) => {
    const where = `chunk ${index}`;
    const rect = chunk.getBoundingClientRect();
    if (Math.abs(rect.width - stageWidth) > 1) out.push(`${where}: width ${rect.width} != ${stageWidth}`);

    const wrap = chunk.classList.contains('wk-wrap') ? chunk : chunk.querySelector('.wk-wrap');
    if (!wrap) {
      out.push(`${where}: no .wk-wrap`);
      return;
    }

    const table = wrap.querySelector('.wk-table');
    const scroll = wrap.querySelector('.tablescroll');
    const cards = wrap.querySelector('.wk-cards');
    if (!table) out.push(`${where}: no .wk-table`);
    if (cards && getComputedStyle(cards).display !== 'none') out.push(`${where}: mobile cards are visible`);
    if (scroll && getComputedStyle(scroll).display === 'none') out.push(`${where}: .tablescroll is hidden`);
    if (table) {
      if (getComputedStyle(table).display === 'none') out.push(`${where}: table is hidden`);
      const columns = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
      if (columns.length !== 10) out.push(`${where}: ${columns.length} header columns, expected 10`);
      const heads = table.querySelectorAll('thead th').length;
      if (heads && table.querySelector('thead').getBoundingClientRect().height < 10) {
        out.push(`${where}: table header did not render`);
      }
    }

    // No edit affordances may reach paper.
    wrap.querySelectorAll('input, textarea, select, .we-edit-cell, .we-type-btn, .we-del-btn, .we-suggest-btn, .we-add-tr').forEach((el) => {
      out.push(`${where}: edit control ${el.className || el.tagName} is inside the capture`);
    });

    // Nothing may poke out of the stage horizontally.
    chunk.querySelectorAll('*').forEach((el) => {
      const box = el.getBoundingClientRect();
      if (!box.width && !box.height) return;
      if (box.left < stageRect.left - 1 || box.right > stageRect.right + 1) {
        out.push(`${where}: ${el.className || el.tagName} overflows (${Math.round(box.left)}..${Math.round(box.right)})`);
      }
    });
  });

  const background = getComputedStyle(stage.querySelector('.wk-wrap') ?? stage).backgroundColor;
  if (background !== 'rgb(255, 255, 255)') out.push(`page background is ${background}, expected white`);

  return out;
}

async function downloadPdf(page, label) {
  const file = path.join(ARTIFACTS, `${label}-weekend.pdf`);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => window.__exportPdf()),
  ]);
  await download.saveAs(file);
  return { file, suggested: download.suggestedFilename() };
}

async function screenshotStage(page, label) {
  await prepareStageForCapture(page, '.print-stage--weekend');

  // Each chunk's own title must sit at its top and no sibling may intrude —
  // the two symptoms of a capture taken across the layout shift.
  const failures = await captureBoxFailures(page, {
    stage: '.print-stage--weekend',
    title: '.wk-title',
  });
  assert.deepEqual(failures, [], `${label} weekend capture boxes:\n${failures.join('\n')}`);

  const chunks = page.locator('.print-stage--weekend > *');
  const count = await chunks.count();
  const captured = [];
  for (let i = 0; i < count; i += 1) {
    const file = path.join(ARTIFACTS, `${label}-weekend-page-${i}.png`);
    // eslint-disable-next-line no-await-in-loop
    const shot = await captureNodePng(page, chunks.nth(i), file);
    // eslint-disable-next-line no-await-in-loop
    const image = decodePng(shot.bytes);
    assertCleanTopBand(image);
    captured.push({ shot, image });
  }
  return captured;
}

/* ===================== Tests ===================== */

for (const viewport of VIEWPORTS) {
  const label = viewport.name;

  test(`週末 print stage renders the desktop table at ${viewport.width}x${viewport.height}`, { timeout: 240_000 }, async () => {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      await page.addInitScript(freezeClock, FIXTURE_NOW);
      await page.goto(`${baseUrl}${FIXTURE_PATH}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="fixture-status"]')?.textContent === 'fixture ready'
          && typeof window.__exportPdf === 'function'
          && Boolean(document.querySelector('.print-stage--weekend')),
        undefined,
        { timeout: 120_000 },
      );
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(150);

      const info = await page.evaluate(() => ({
        visible: window.__fixture.visible(),
        chunks: window.__fixture.chunks,
        rendered: document.querySelectorAll('.print-stage--weekend > *').length,
        rows: document.querySelectorAll('.print-stage--weekend .wk-table tbody tr').length,
      }));
      assert.equal(info.visible, ROWS.length, 'the year/filter gate dropped fixture rows');
      assert.equal(info.chunks, CHUNKS.length, 'chunk count changed');
      assert.equal(info.rendered, CHUNKS.length, 'one capture per page-sized chunk');
      assert.ok(info.rows > 0, 'no rows reached the print stage');

      const failures = await page.evaluate(inspectStage, STAGE_WIDTH);
      assert.deepEqual(failures, [], `週末 stage geometry (${label}):\n${failures.join('\n')}`);

      // Sanity: the rendered table uses the fixture's getAssign override.
      const chair = await page.evaluate(() => {
        const row = [...document.querySelectorAll('.print-stage--weekend .wk-table tbody tr')]
          .find((tr) => tr.children[1]?.textContent.trim() === '101');
        return row?.children[5]?.textContent.trim();
      });
      assert.equal(chair, fixtureWeekendGetAssign('wefx-0_chair', ''), 'print rows do not use getAssign');

      const nodeSizes = await page.evaluate(() => [...document.querySelectorAll('.print-stage--weekend > *')]
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }));

      // Every page keeps its natural size: none may need the "shrink to fit A4"
      // path, which is what makes a crowded table unreadable on paper.
      nodeSizes.forEach((size, index) => {
        const aspect = size.height / size.width;
        assert.ok(
          aspect <= MAX_CAPTURE_ASPECT + 0.001,
          `page ${index} is ${aspect.toFixed(3)} tall per wide, page limit is ${MAX_CAPTURE_ASPECT.toFixed(3)}`,
        );
      });

      const { file, suggested } = await downloadPdf(page, label);
      const { images } = readPdf(file, { pages: CHUNKS.length, images: CHUNKS.length });
      assertImageRatios(images, nodeSizes, `${label} weekend PDF`);
      assert.match(suggested, /^週末聚會.*\.pdf$/, `unexpected download name: ${suggested}`);

      // The PDF embeds one image per chunk, captured at 2× the CSS box. If a
      // capture were offset (its own title missing) the image would still have
      // the chunk's size — so the size check is paired with the title-band and
      // sibling checks done on the PNGs below.
      images.forEach((img, index) => {
        const height = img.height / 2;
        const expected = nodeSizes[index].height;
        const drift = Math.abs(height - expected) / expected;
        assert.ok(
          drift <= 0.02,
          `${label} weekend PDF: image ${index} is ${height.toFixed(0)}px tall, chunk is ${expected.toFixed(0)}px (${(drift * 100).toFixed(1)}% off)`,
        );
      });

      // The PNGs are the visual record a reviewer looks at: each must be exactly
      // its own chunk — title at the top, no slice of a sibling.
      const captured = await screenshotStage(page, label);
      assert.equal(captured.length, CHUNKS.length, `${label}: one PNG per chunk`);
      captured.forEach(({ shot }, index) => {
        assert.ok(
          Math.abs(shot.height - nodeSizes[index].height) < 1,
          `${label}: PNG ${index} is ${shot.height}px tall, chunk is ${nodeSizes[index].height.toFixed(0)}px`,
        );
      });
    } finally {
      await page.close();
    }
  });
}
