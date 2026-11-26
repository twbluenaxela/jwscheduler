// End-to-end guard for the 服務 export (下載 PDF / 匯出 JPG).
//
// 服務 is the one page that shows ONE category at a time, so its export cannot
// screenshot what is on screen: the sheet is a separate read-only render of the
// month — every category, from a single /api/services/month payload — inside the
// shared PrintStage. This test mounts the real page behind a mocked API, presses
// 匯出 the way a person would, and inspects the downloaded bytes and the sheet's
// geometry at a phone and a desktop size.
//
//   npm run test:e2e
//
// Set BASE_URL to test an already-running server instead of spawning `next dev`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

import { FIXTURE_CATEGORIES, FIXTURE_MONTH } from '../../app/test-fixtures/services-pdf/fixtureMonth.mjs';
import {
  ARTIFACTS,
  assertCleanTopBand,
  assertImageRatios,
  captureBoxFailures,
  captureNodePng,
  decodePng,
  ensureArtifacts,
  jpegWidth,
  prepareStageForCapture,
  readPdf,
  startDevServer,
} from './helpers.mjs';

const FIXTURE_PATH = '/test-fixtures/services-pdf';
const STAGE_WIDTH = 960;
const MONTH_LABEL = `${FIXTURE_MONTH.slice(0, 4)}年${Number(FIXTURE_MONTH.slice(5))}月`;

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
];

let server;
let baseUrl;
let browser;

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

// Runs in the page against the permanent fixture stage: the sheet must be a
// read-only, white, desktop-width page with one block per category. Everything
// it needs is passed in — the page context has no module scope.
function inspectSheet({ stageWidth, monthLabel, categories }) {
  const out = [];
  const stage = document.querySelector('.print-stage--services');
  if (!stage) return ['no .print-stage--services'];
  const rect = stage.getBoundingClientRect();
  if (Math.abs(rect.width - stageWidth) > 1) out.push(`stage width ${rect.width} != ${stageWidth}`);

  const sheet = stage.querySelector('.svc-print');
  if (!sheet) return [...out, 'no .svc-print'];

  const style = getComputedStyle(sheet);
  if (style.backgroundColor !== 'rgb(255, 255, 255)') out.push(`sheet background is ${style.backgroundColor}`);

  const head = sheet.querySelector('.svc-print-head h2');
  if (!head) out.push('no sheet heading');
  else if (!head.textContent.includes(monthLabel)) out.push(`heading "${head.textContent}" is not ${monthLabel}`);

  const blocks = [...sheet.querySelectorAll('.svc-print-block')];
  if (blocks.length !== categories.length) {
    out.push(`${blocks.length} category blocks, expected ${categories.length}`);
  }
  const titles = blocks.map((block) => block.querySelector('h3')?.textContent.trim());
  for (const category of categories) {
    if (!titles.includes(category.name)) out.push(`category ${category.name} is missing from the sheet`);
  }

  blocks.forEach((block, index) => {
    const where = `block ${index} (${titles[index]})`;
    const table = block.querySelector('.svc-print-table');
    if (!table) {
      out.push(`${where}: no table`);
      return;
    }
    if (table.querySelectorAll('thead th').length < 2) out.push(`${where}: fewer than two columns`);
    if (!table.querySelectorAll('tbody tr').length) out.push(`${where}: no rows`);
    if (table.getBoundingClientRect().width < stageWidth * 0.9) {
      out.push(`${where}: table only ${Math.round(table.getBoundingClientRect().width)}px wide`);
    }
  });

  // The live page's controls must never reach paper.
  stage.querySelectorAll('button, input, textarea, select, .service-cell, .service-table').forEach((el) => {
    out.push(`sheet contains a control: ${el.className || el.tagName}`);
  });

  sheet.querySelectorAll('*').forEach((el) => {
    const box = el.getBoundingClientRect();
    if (!box.width && !box.height) return;
    if (box.left < rect.left - 1 || box.right > rect.right + 1) {
      out.push(`${el.className || el.tagName} overflows (${Math.round(box.left)}..${Math.round(box.right)})`);
    }
  });

  return out;
}

async function openExportMenu(page) {
  const trigger = page.getByRole('button', { name: /匯出/ });
  await trigger.click();
  const menu = page.locator('.menu[role="menu"]');
  await menu.waitFor({ state: 'visible', timeout: 30_000 });
  return menu;
}

async function screenshotSheet(page, label) {
  await prepareStageForCapture(page, '.print-stage--services');

  const failures = await captureBoxFailures(page, {
    stage: '.print-stage--services',
    title: '.svc-print-head',
  });
  assert.deepEqual(failures, [], `${label} services capture boxes:\n${failures.join('\n')}`);

  const sheet = page.locator('.print-stage--services > *').first();
  const file = path.join(ARTIFACTS, `${label}-services-sheet.png`);
  const shot = await captureNodePng(page, sheet, file);
  const image = decodePng(shot.bytes);
  // The sheet's own heading is the top of the page: an offset capture starts
  // with table rows instead (the heading is white band + dark text strokes).
  assertCleanTopBand(image, { band: 24, minRowMean: 160 });
  return shot;
}

/* ===================== Tests ===================== */

for (const viewport of VIEWPORTS) {
  const label = viewport.name;

  test(`服務 匯出 → 下載 PDF at ${viewport.width}x${viewport.height}`, { timeout: 240_000 }, async () => {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      await page.goto(`${baseUrl}${FIXTURE_PATH}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="fixture-status"]')?.textContent === 'fixture ready'
          && document.querySelectorAll('.service-tabs button').length > 1,
        undefined,
        { timeout: 120_000 },
      );
      await page.evaluate(() => document.fonts?.ready);

      const failures = await page.evaluate(inspectSheet, {
        stageWidth: STAGE_WIDTH,
        monthLabel: MONTH_LABEL,
        categories: FIXTURE_CATEGORIES.map((category) => ({ name: category.name })),
      });
      assert.deepEqual(failures, [], `服務 sheet geometry (${label}):\n${failures.join('\n')}`);

      const nodeSizes = await page.evaluate(() => [...document.querySelectorAll('.print-stage--services > *')]
        .map((node) => {
          const rect = node.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        }));

      await openExportMenu(page);
      const file = path.join(ARTIFACTS, `${label}-services.pdf`);
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('.menu[role="menu"] .menu__item', { hasText: '下載 PDF' }).click(),
      ]);
      await download.saveAs(file);

      assert.equal(download.suggestedFilename(), `服務_${MONTH_LABEL}.pdf`);
      const { images } = readPdf(file, { pages: 1, images: 1 });
      assertImageRatios(images, nodeSizes, `${label} services PDF`);
      // 2× the CSS box: a captured image taller/shorter than the sheet means the
      // capture was of a different layout than the one measured.
      const sheetHeight = nodeSizes[0].height;
      const drift = Math.abs(images[0].height / 2 - sheetHeight) / sheetHeight;
      assert.ok(
        drift <= 0.02,
        `${label} services PDF: image is ${(images[0].height / 2).toFixed(0)}px tall, sheet is ${sheetHeight.toFixed(0)}px (${(drift * 100).toFixed(1)}% off)`,
      );

      // The export must leave the page usable: the temporary stage is gone and
      // the menu closed (only the fixture's permanent stage remains).
      await page.waitForFunction(
        () => document.querySelectorAll('.print-stage--services').length === 1,
        undefined,
        { timeout: 15_000 },
      );
      assert.equal(await page.locator('.menu[role="menu"]').count(), 0, 'the export menu stayed open');

      await screenshotSheet(page, label);
    } finally {
      await page.close();
    }
  });

  test(`服務 匯出 → 匯出 JPG at ${viewport.width}x${viewport.height}`, { timeout: 240_000 }, async () => {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    try {
      await page.goto(`${baseUrl}${FIXTURE_PATH}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(
        () => document.querySelector('[data-testid="fixture-status"]')?.textContent === 'fixture ready'
          && document.querySelectorAll('.service-tabs button').length > 1,
        undefined,
        { timeout: 120_000 },
      );
      await page.evaluate(() => document.fonts?.ready);

      await openExportMenu(page);
      const file = path.join(ARTIFACTS, `${label}-services.jpg`);
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.locator('.menu[role="menu"] .menu__item', { hasText: '匯出 JPG' }).click(),
      ]);
      await download.saveAs(file);

      assert.equal(download.suggestedFilename(), `服務_${MONTH_LABEL}.jpg`);
      // A JPEG of the sheet, not a stray download: SOI marker, and 2× the
      // 960 px stage (html-to-image's pixelRatio).
      const bytes = fs.readFileSync(file);
      assert.equal(bytes[0], 0xff, 'JPG does not start with 0xFF');
      assert.equal(bytes[1], 0xd8, 'JPG does not start with 0xFFD8');
      const width = jpegWidth(bytes);
      assert.ok(
        Math.abs(width - STAGE_WIDTH * 2) <= 2,
        `JPG is ${width}px wide, expected ${STAGE_WIDTH * 2}`,
      );
    } finally {
      await page.close();
    }
  });
}
