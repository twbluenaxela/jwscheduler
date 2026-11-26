// End-to-end audit of EVERY export action in the app.
//
// Each block mounts a fixture route that renders the real component with
// synthetic data (no login, no database) and then presses the real menu item
// the way a person would, asserting the OUTPUT — the clipboard text, the JPEG's
// own dimensions and filename, the PNG on the clipboard, the unzipped workbook,
// the PDF's pages, the print window's markup and its print() call — plus that
// the action logged no console error and left no alert dialog unhandled.
//
// Covered here: 週中 匯出 (JPG/複製圖片/文字/Excel/PDF, read + edit mode and a
// cancelled week), 週末 匯出 (same, read + edit mode), 匯出 page (分享圖片 zip,
// PDF 版面, 下載 PDF, 匯出 Excel, 列印), 指派分布 (grid + 個人檢視), 人員 (iCal +
// 複製行事曆連結), 總覽 複製文字, 書刊 S-28 列印, 服務 (下載 PDF / 匯出 JPG).
//
//   npm run test:e2e
//
// Set BASE_URL to test an already-running server instead of spawning `next dev`.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';

import JSZip from 'jszip';
import { chromium } from 'playwright';

import { DEFAULT_LAYOUT, normalizeLayout, paginate } from '../../app/lib/pdfLayout.mjs';
import { isMidweekSuspended } from '../../app/lib/weekType.mjs';
import { FIXTURE_WEEKS } from '../../app/test-fixtures/midweek-pdf/fixtureWeeks.mjs';
import { FIXTURE_NOW, fixtureWeekendGetAssign, weekendFixtureRows } from '../../app/test-fixtures/weekend-pdf/fixtureRows.mjs';
import {
  ARTIFACTS,
  decodePng,
  ensureArtifacts,
  jpegSize,
  readPdf,
  readXlsx,
  startDevServer,
} from './helpers.mjs';

const OUT = path.join(ARTIFACTS, 'exports');
const ROUTE = '/test-fixtures/exports';
const DESKTOP = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

let server;
let baseUrl;
let browser;
let context;
let phoneContext;

// Next's dev overlay and HMR chatter are not the export's doing.
const IGNORED_CONSOLE = [
  'Download the React DevTools',
  '[Fast Refresh]',
  'websocket',
  'net::ERR_ABORTED',
];

before(async () => {
  ensureArtifacts();
  fs.mkdirSync(OUT, { recursive: true });
  const started = await startDevServer(`${ROUTE}/midweek`);
  baseUrl = started.baseUrl;
  server = started.stop;
  browser = await chromium.launch();
  const opts = {
    permissions: ['clipboard-read', 'clipboard-write'],
    acceptDownloads: true,
  };
  context = await browser.newContext({ ...opts, viewport: DESKTOP });
  phoneContext = await browser.newContext({ ...opts, viewport: PHONE });
  // 列印 opens a popup and calls print() 250 ms later. Stub print BEFORE any
  // popup exists (a context init script also runs in every new page) so the
  // suite can prove the call happened instead of blocking on a print dialog.
  await context.addInitScript(() => {
    window.print = () => { window.__printed = (window.__printed ?? 0) + 1; };
  });
  await phoneContext.addInitScript(() => {
    window.print = () => { window.__printed = (window.__printed ?? 0) + 1; };
  });
}, { timeout: 300_000 });

after(async () => {
  await context?.close();
  await phoneContext?.close();
  await browser?.close();
  server?.();
});

/* ===================== page plumbing ===================== */

// Collects console errors, page errors and dialogs so a test can assert the
// action was silent. Dialogs are accepted so the page never hangs.
function watch(page) {
  const errors = [];
  const dialogs = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((needle) => text.includes(needle))) return;
    errors.push(`console: ${text}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.accept().catch(() => {});
  });
  return { errors, dialogs };
}

async function openFixture(ctx, route, { query = '', init = null } = {}) {
  const page = await ctx.newPage();
  if (init) await page.addInitScript(init, FIXTURE_NOW);
  const watched = watch(page);
  await page.goto(`${baseUrl}${ROUTE}/${route}${query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.querySelector('[data-testid="fixture-status"]')?.textContent === 'fixture ready',
    undefined,
    { timeout: 180_000 },
  );
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(200);
  return { page, ...watched };
}

// Opens the 匯出 trigger and waits for the panel to be on screen.
async function openExport(page, label = /匯出/) {
  await page.getByRole('button', { name: label }).first().click();
  await page.locator('.menu__item').first().waitFor({ state: 'visible', timeout: 30_000 });
}

async function clickItem(page, text) {
  const item = page.locator('.menu__item', { hasText: text }).first();
  await item.click();
  // The panel closes immediately; give the action a beat to start.
  await page.waitForTimeout(100);
}

async function download(page, fn) {
  const [event] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), fn()]);
  const file = path.join(OUT, `${Date.now()}-${event.suggestedFilename()}`);
  await event.saveAs(file);
  return { file, suggested: event.suggestedFilename() };
}

const readClipboardText = (page) => page.evaluate(() => navigator.clipboard.readText());

// Reads the image/png item off the clipboard as base64 (Chromium only exposes
// the clipboard's contents to a page with clipboard-read granted).
const readClipboardPng = (page) => page.evaluate(async () => {
  const items = await navigator.clipboard.read();
  for (const item of items) {
    if (!item.types.includes('image/png')) continue;
    const blob = await item.getType('image/png');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
  return null;
});

// The clipboard outlives a page: a previous test's PNG would satisfy the next
// test's read before its own capture finished. Clear it to a plain string first
// (write replaces the whole clipboard), so any PNG seen later is the new one.
async function clearClipboard(page) {
  await page.evaluate(async () => {
    await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([''], { type: 'text/plain' }) })]);
  });
}

// 複製圖片 writes the clipboard only after the capture finishes, and a capture of
// a tall table takes seconds — polling beats a fixed sleep and removes the
// flake entirely (a slow run otherwise reads the PREVIOUS clipboard contents,
// or nothing at all).
async function waitForClipboardPng(page, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const png = await readClipboardPng(page);
    if (png) return png;
    if (Date.now() > deadline) return png;
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(250);
  }
}

// Text exports are what get pasted into a LINE group: assert the real content,
// not just "something non-empty", and assert no template hole leaked.
function assertPasteable(text, { must = [], mustNot = [], label }) {
  assert.ok(text.length > 10, `${label}: clipboard text is too short (${JSON.stringify(text)})`);
  for (const needle of must) {
    assert.ok(text.includes(needle), `${label}: text is missing ${JSON.stringify(needle)}\n---\n${text}\n---`);
  }
  for (const needle of mustNot) {
    assert.ok(!text.includes(needle), `${label}: text contains ${JSON.stringify(needle)}`);
  }
  assert.doesNotMatch(text, /\bundefined\b|\bnull\b|\[object /, `${label}: text has a template hole\n${text}`);
}

// A screenshot export must be the node's own box at html-to-image's 2× ratio.
function assertJpegOf(bytes, box, { label, filename, expect }) {
  const size = jpegSize(bytes);
  if (expect) assert.equal(size.width, expect * 2, `${label}: JPG width ${size.width} is not 2× ${expect}`);
  const drift = Math.abs(size.width / 2 - box.width) / box.width;
  assert.ok(drift <= 0.02, `${label}: JPG is ${size.width / 2}px wide, node is ${box.width.toFixed(0)}px`);
  if (box.height) {
    const hDrift = Math.abs(size.height / 2 - box.height) / box.height;
    assert.ok(hDrift <= 0.02, `${label}: JPG is ${size.height / 2}px tall, node is ${box.height.toFixed(0)}px`);
  }
  assert.ok(filename, `${label}: download has no filename`);
  return size;
}

function boxOf(page, selector) {
  return page.locator(selector).first().boundingBox();
}

function assertSilent({ errors, dialogs }, label, expectedAlerts = 0) {
  assert.deepEqual(errors, [], `${label}: console/page errors\n${errors.join('\n')}`);
  assert.equal(dialogs.length, expectedAlerts, `${label}: expected ${expectedAlerts} alert(s), got ${dialogs.join(' | ')}`);
}

/* ===================== 週中 匯出 ===================== */

test('週中 匯出 menu: 文字 / JPG / 複製圖片 / Excel / PDF produce real output', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'midweek');
  try {
    const week = FIXTURE_WEEKS[0];
    const card = await boxOf(page, '.card');

    // ── 複製文字 ──
    await openExport(page);
    await clickItem(page, '複製文字');
    await page.waitForFunction(() => document.querySelector('[data-testid="fixture-status"]') !== null);
    await page.waitForTimeout(300);
    const text = await readClipboardText(page);
    assertPasteable(text, {
      label: '週中 複製文字',
      must: [
        `📋 週中 — ${week.dateLabel}`,
        '每週閱讀經文：以賽亞書 45:1–10',
        '主席：王小明',
        '【上帝話語的寶藏】',
        '【用心準備傳道工作】',
        '【基督徒的生活】',
        // role labels: "陳大文 / 林小華" alone does not say who is the student
        '陳大文（學生） / 林小華（助手）',
        '李淑芬（主持） / 黃俊傑（朗讀）',
        '結束禱告：吳天恩',
      ],
    });
    assert.match(dialogs[0] ?? '', /已複製本週節目文字/, 'no copy confirmation alert');

    // ── 匯出 JPG ──
    await openExport(page);
    const jpg = await download(page, () => clickItem(page, '匯出 JPG'));
    assert.equal(jpg.suggested, `${week.dateLabel}.jpg`);
    assertJpegOf(fs.readFileSync(jpg.file), card, { label: '週中 JPG', filename: jpg.suggested });

    // ── 複製圖片到剪貼簿 ──
    await clearClipboard(page);
    await openExport(page);
    await clickItem(page, '複製圖片到剪貼簿');
    const png = await waitForClipboardPng(page);
    assert.ok(png, 'the clipboard holds no image/png after 複製圖片');
    const image = decodePng(Buffer.from(png, 'base64'));
    const pngDrift = Math.abs(image.width / 2 - card.width) / card.width;
    assert.ok(pngDrift <= 0.02, `clipboard PNG is ${image.width}px wide, card is ${card.width.toFixed(0)}px`);
    fs.writeFileSync(path.join(OUT, 'midweek-clipboard.png'), Buffer.from(png, 'base64'));

    // ── 匯出 Excel ──
    await openExport(page);
    const xlsx = await download(page, () => clickItem(page, '匯出 Excel'));
    assert.equal(xlsx.suggested, `${week.dateLabel}.xlsx`);
    const book = await readXlsx(xlsx.file);
    assert.ok(book.sheetNames.length >= 1, '週中 workbook has no sheet');
    assert.equal(book.sheetNames[0], `第1頁 ${week.dateLabel}`, `unexpected sheet name ${book.sheetNames[0]}`);
    // The sheet's date cells are the short "9/9" form (the long label lives in
    // the sheet name), so check both shapes the week really carries.
    const shortDate = week.dateLabel.match(/\d+/g).slice(0, 2).join('/');
    for (const needle of [shortDate, '王小明', '何美玲', '以賽亞書 45:1–10']) {
      assert.ok(book.text.includes(needle), `週中 xlsx is missing ${needle}`);
    }
    assert.doesNotMatch(book.text, /undefined|\[object /, '週中 xlsx has a template hole');

    // ── 下載 PDF ──
    await openExport(page);
    const pdf = await download(page, () => clickItem(page, '下載 PDF'));
    assert.equal(pdf.suggested, `${week.dateLabel}.pdf`);
    // The PDF captures the off-screen stage (960px, print CSS), not the live
    // card, so compare with that node.
    const stage = await boxOf(page, '.print-stage > .card');
    const parsed = readPdf(pdf.file, { pages: 1, images: 1 });
    const pdfDrift = Math.abs(parsed.images[0].height / 2 - stage.height) / stage.height;
    assert.ok(pdfDrift <= 0.02, `PDF image is ${(parsed.images[0].height / 2).toFixed(0)}px tall, stage is ${stage.height.toFixed(0)}px`);
    assert.equal(parsed.images[0].width, 1920, `PDF image is ${parsed.images[0].width}px wide, expected the 960px stage at 2×`);

    assertSilent({ errors, dialogs }, '週中 export menu', 1);
  } finally {
    await page.close();
  }
});

test('週中 匯出 in EDIT mode captures the read-only stage, not the editable card', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'midweek', { query: '?editing=1' });
  try {
    assert.equal(await page.evaluate(() => document.body.classList.contains('editing')), true);
    // The live card carries the edit bar; the stage card does not. Different
    // heights, so a JPG matching the stage proves the edit chrome stayed out.
    const live = await boxOf(page, '.card');
    const stage = await boxOf(page, '.print-stage > .card');
    assert.ok(live.height > stage.height, 'fixture did not render an edit bar on the live card');

    await openExport(page);
    const jpg = await download(page, () => clickItem(page, '匯出 JPG'));
    assertJpegOf(fs.readFileSync(jpg.file), stage, { label: '週中 edit JPG', filename: jpg.suggested });

    await clearClipboard(page);
    await openExport(page);
    await clickItem(page, '複製圖片到剪貼簿');
    const png = await waitForClipboardPng(page);
    const image = decodePng(Buffer.from(png, 'base64'));
    const stageDrift = Math.abs(image.height / 2 - stage.height) / stage.height;
    assert.ok(stageDrift <= 0.02, `edit-mode clipboard PNG is ${image.height / 2}px tall, stage is ${stage.height.toFixed(0)}px`);

    assertSilent({ errors, dialogs }, '週中 edit JPG');
  } finally {
    await page.close();
  }
});

test('週中 cancelled week: 複製文字 is the 暫停 notice and the PDF is one page', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'midweek', { query: '?week=2' });
  try {
    const week = FIXTURE_WEEKS[2];
    assert.ok(isMidweekSuspended(week), 'fixture week 2 is not suspended');

    await openExport(page);
    await clickItem(page, '複製文字');
    await page.waitForTimeout(300);
    const text = await readClipboardText(page);
    assertPasteable(text, {
      label: '週中 暫停 複製文字',
      must: [`📋 週中 — ${week.dateLabel}`, `本週聚會暫停 — ${week.label}`],
      mustNot: ['【上帝話語的寶藏】', '主席：'],
    });

    await openExport(page);
    const pdf = await download(page, () => clickItem(page, '下載 PDF'));
    readPdf(pdf.file, { pages: 1, images: 1 });

    // A suspended week still exports a JPG — of the notice card. Read mode
    // captures the live card (the one a phone is looking at), so compare with it.
    const card = await boxOf(page, '.card');
    await openExport(page);
    const jpg = await download(page, () => clickItem(page, '匯出 JPG'));
    assertJpegOf(fs.readFileSync(jpg.file), card, { label: '週中 暫停 JPG', filename: jpg.suggested });

    assertSilent({ errors, dialogs }, '週中 cancelled week', 1);
  } finally {
    await page.close();
  }
});

test('週中 JPG on a PHONE is the stacked mobile card', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(phoneContext, 'midweek');
  try {
    const card = await boxOf(page, '.card');
    assert.ok(card.width <= 390, `phone card is ${card.width}px wide`);
    await openExport(page);
    const jpg = await download(page, () => clickItem(page, '匯出 JPG'));
    const size = assertJpegOf(fs.readFileSync(jpg.file), card, { label: 'phone 週中 JPG', filename: jpg.suggested });
    assert.ok(size.width < 960 * 2, 'the phone export captured the desktop stage, not the phone card');
    assertSilent({ errors, dialogs }, 'phone 週中 JPG');
  } finally {
    await page.close();
  }
});

/* ===================== 週末 匯出 ===================== */

test('週末 匯出 menu: 文字 / JPG / 複製圖片 / Excel / PDF produce real output', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'weekend', { init: freezeClock });
  try {
    const rows = weekendFixtureRows();
    const visible = await page.evaluate(() => document.querySelectorAll('.wk-table tbody tr').length);
    assert.ok(visible > 0, 'the year/filter gate dropped every weekend row');

    await openExport(page);
    await clickItem(page, '複製文字');
    await page.waitForTimeout(300);
    const text = await readClipboardText(page);
    assertPasteable(text, {
      label: '週末 複製文字',
      must: [
        '📋 公眾演講安排表',
        `編號 ${rows[0].no}`,
        `主題：${rows[0].topic}`,
        `主席：${fixtureWeekendGetAssign('wefx-0_chair', '')}`,
        '◆ 分區大會',
        '本週沒有聚會',
      ],
    });
    assert.match(dialogs.at(-1) ?? '', /已複製週末安排文字/, 'no copy confirmation alert');

    // The live table is the capture node (read mode), so the image is that
    // node's box at 2× — on desktop the full-width table, wide enough that the
    // capture is not the 960px print stage.
    const live = await boxOf(page, '.wk-wrap');
    await openExport(page);
    const jpg = await download(page, () => clickItem(page, '匯出 JPG'));
    assert.match(jpg.suggested, /^週末聚會_.*\.jpg$/, `unexpected name ${jpg.suggested}`);
    const size = assertJpegOf(fs.readFileSync(jpg.file), live, { label: '週末 JPG', filename: jpg.suggested });
    assert.ok(size.width > 1920, `週末 JPG is ${size.width}px wide — that is the print stage, not the live table`);

    await clearClipboard(page);
    await openExport(page);
    await clickItem(page, '複製圖片到剪貼簿');
    const png = await waitForClipboardPng(page);
    assert.ok(png, 'the clipboard holds no image after 週末 複製圖片');
    const image = decodePng(Buffer.from(png, 'base64'));
    const pngDrift = Math.abs(image.width / 2 - live.width) / live.width;
    assert.ok(pngDrift <= 0.02, `週末 clipboard PNG is ${image.width / 2}px wide, table is ${live.width.toFixed(0)}px`);

    await openExport(page);
    const xlsx = await download(page, () => clickItem(page, '匯出 Excel'));
    // Excel keeps the plain 週末_ label; only the image/PDF names say 聚會.
    assert.match(xlsx.suggested, /^週末_.*\.xlsx$/, `unexpected name ${xlsx.suggested}`);
    const book = await readXlsx(xlsx.file);
    assert.deepEqual(book.sheetNames, ['週末']);
    for (const needle of ['日期', '編號', '演講主題', rows[0].topic, rows[0].speaker]) {
      assert.ok(book.text.includes(needle), `週末 xlsx is missing ${needle}`);
    }
    assert.doesNotMatch(book.text, /undefined|\[object /);

    await openExport(page);
    const pdf = await download(page, () => clickItem(page, '下載 PDF'));
    assert.match(pdf.suggested, /^週末聚會_.*\.pdf$/);
    const chunks = await page.evaluate(() => document.querySelectorAll('.print-stage--weekend > *').length);
    readPdf(pdf.file, { pages: chunks, images: chunks });
    assert.ok(live.width > 0);

    assertSilent({ errors, dialogs }, '週末 export menu', 1);
  } finally {
    await page.close();
  }
});

test('週末 匯出 in EDIT mode: JPG/複製圖片 use the print stage, not the edit inputs', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'weekend', { query: '?editing=1', init: freezeClock });
  try {
    assert.ok(await page.locator('.we-edit-cell').count(), 'weekend edit mode did not render its edit inputs');
    const stageNode = await boxOf(page, '.print-stage--weekend > *');
    await openExport(page);
    const jpg = await download(page, () => clickItem(page, '匯出 JPG'));
    const size = jpegSize(fs.readFileSync(jpg.file));
    assert.equal(size.width, 1920);
    const drift = Math.abs(size.height / 2 - stageNode.height) / stageNode.height;
    assert.ok(drift <= 0.02, `edit JPG is ${(size.height / 2).toFixed(0)}px tall, stage chunk is ${stageNode.height.toFixed(0)}px`);

    await clearClipboard(page);
    await openExport(page);
    await clickItem(page, '複製圖片到剪貼簿');
    const png = await waitForClipboardPng(page);
    assert.ok(png, 'the clipboard holds no image after 週末 edit 複製圖片');
    const image = decodePng(Buffer.from(png, 'base64'));
    const pngDrift = Math.abs(image.height / 2 - stageNode.height) / stageNode.height;
    assert.ok(pngDrift <= 0.02, `edit clipboard PNG is ${(image.height / 2).toFixed(0)}px tall, stage chunk is ${stageNode.height.toFixed(0)}px`);

    assertSilent({ errors, dialogs }, '週末 edit JPG');
  } finally {
    await page.close();
  }
});

test('週末 JPG on a PHONE captures the live card list, not the desktop table', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(phoneContext, 'weekend', { init: freezeClock });
  try {
    const cards = await page.locator('.wk-cards .wk-card').count();
    assert.ok(cards > 0, 'phone weekend view did not render its card list');
    // Read mode keeps the live node, so a phone gets the stacked cards it is
    // looking at — never the 960px desktop table from the print stage.
    const live = await boxOf(page, '.wk-wrap');
    assert.ok(live.width <= 390, `phone .wk-wrap is ${live.width}px wide`);
    await openExport(page);
    const jpg = await download(page, () => clickItem(page, '匯出 JPG'));
    const size = assertJpegOf(fs.readFileSync(jpg.file), live, { label: 'phone 週末 JPG', filename: jpg.suggested });
    assert.ok(size.width < 1920, `phone 週末 JPG is ${size.width}px wide — that is the print stage`);
    assertSilent({ errors, dialogs }, 'phone 週末 JPG');
  } finally {
    await page.close();
  }
});

/* ===================== 匯入 / 匯出 page ===================== */

test('匯出 page: 分享圖片 is a zip with one JPG per week, names aligned', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'import');
  try {
    assert.equal(await page.locator('.exp-card').count(), 5, 'the export cards did not render');
    const [event] = await Promise.all([
      page.waitForEvent('download', { timeout: 180_000 }),
      page.locator('.exp-card', { hasText: '分享圖片' }).click(),
    ]);
    const file = path.join(OUT, `import-${event.suggestedFilename()}`);
    await event.saveAs(file);
    assert.match(event.suggestedFilename(), /^週中_.*\.zip$/, `unexpected name ${event.suggestedFilename()}`);

    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    // Order inside a zip is not meaningful; the SET of names is.
    const entries = Object.keys(zip.files).filter((name) => name.endsWith('.jpg'));
    assert.deepEqual(
      [...entries].sort(),
      FIXTURE_WEEKS.map((week) => `${week.dateLabel}.jpg`).sort(),
      'the zip does not hold one correctly named JPG per week',
    );
    for (const name of entries) {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await zip.file(name).async('nodebuffer');
      assert.equal(bytes[0], 0xff, `${name} is not a JPEG`);
      assert.equal(bytes[1], 0xd8);
      assert.ok(jpegSize(bytes).width > 100, `${name} has no SOF size`);
    }
    assertSilent({ errors, dialogs }, '匯出 分享圖片');
  } finally {
    await page.close();
  }
});

test('匯出 page: PDF 版面 honours the chosen layout, 下載 PDF is one page per week', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'import');
  try {
    // ── PDF 版面 ──
    await page.locator('.exp-card', { hasText: 'PDF 版面' }).click();
    const sheet = page.locator('.sheet--pdflay');
    await sheet.waitFor({ state: 'visible', timeout: 30_000 });
    assert.match(await sheet.locator('.pdflay-steps__count').textContent(), /每頁 2 週/);
    const expectedPages = paginate(FIXTURE_WEEKS, normalizeLayout({ ...DEFAULT_LAYOUT, count: 2 }), isMidweekSuspended).length;
    assert.match(await sheet.locator('.pdflay-note').textContent(), new RegExp(`共 ${expectedPages} 頁`));

    const [gridEvent] = await Promise.all([
      page.waitForEvent('download', { timeout: 180_000 }),
      sheet.getByRole('button', { name: '下載 PDF' }).click(),
    ]);
    const gridFile = path.join(OUT, `import-layout-${gridEvent.suggestedFilename()}`);
    await gridEvent.saveAs(gridFile);
    readPdf(gridFile, { pages: expectedPages });
    await sheet.waitFor({ state: 'hidden', timeout: 15_000 });

    // ── 下載 PDF (one per week) ──
    const [pdfEvent] = await Promise.all([
      page.waitForEvent('download', { timeout: 180_000 }),
      page.locator('.exp-card', { hasText: '下載 PDF' }).click(),
    ]);
    const pdfFile = path.join(OUT, `import-${pdfEvent.suggestedFilename()}`);
    await pdfEvent.saveAs(pdfFile);
    readPdf(pdfFile, { pages: FIXTURE_WEEKS.length, images: FIXTURE_WEEKS.length });
    assertSilent({ errors, dialogs }, '匯出 PDF');
  } finally {
    await page.close();
  }
});

test('匯出 page: 匯出 Excel holds every week, 列印 opens one page per week and calls print()', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'import');
  try {
    const [xlsxEvent] = await Promise.all([
      page.waitForEvent('download', { timeout: 180_000 }),
      page.locator('.exp-card', { hasText: '匯出 Excel' }).click(),
    ]);
    const xlsxFile = path.join(OUT, `import-${xlsxEvent.suggestedFilename()}`);
    await xlsxEvent.saveAs(xlsxFile);
    const book = await readXlsx(xlsxFile);
    assert.ok(book.sheetNames.length >= 2, `expected one sheet per 2 weeks, got ${book.sheetNames.join(', ')}`);
    // Every scheduled week carries its own short date (the long label lives in
    // the sheet name) and its reading.
    for (const week of FIXTURE_WEEKS.filter((w) => !isMidweekSuspended(w))) {
      const shortDate = week.dateLabel.match(/\d+/g).slice(0, 2).join('/');
      assert.ok(book.text.includes(shortDate), `xlsx is missing ${shortDate}`);
      assert.ok(book.text.includes(week.reading), `xlsx is missing the reading for ${week.dateLabel}`);
    }
    assert.ok(
      book.sheetNames.some((name) => name.includes(FIXTURE_WEEKS[0].dateLabel)),
      `no sheet is named after the first week: ${book.sheetNames.join(', ')}`,
    );
    assert.doesNotMatch(book.text, /undefined|\[object /);

    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 180_000 }),
      page.locator('.exp-card', { hasText: '直接送印表機' }).click(),
    ]);
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForFunction(() => (window.__printed ?? 0) > 0, undefined, { timeout: 30_000 });
    const pages = await popup.locator('section.page').count();
    assert.equal(pages, FIXTURE_WEEKS.length, `print window has ${pages} pages, expected ${FIXTURE_WEEKS.length}`);
    const imgs = await popup.locator('section.page img').evaluateAll((els) => els.map((el) => el.getAttribute('src')?.slice(0, 23)));
    assert.ok(imgs.every((src) => src?.startsWith('data:image/jpeg')), `print pages do not embed JPEG captures: ${imgs.join(', ')}`);
    assertSilent({ errors, dialogs }, '匯出 列印');
  } finally {
    await page.close();
  }
});

/* ===================== 指派分布 ===================== */

test('指派分布 總覽格線: 文字 / JPG / 複製圖片 / Excel / PDF', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'heatmap');
  try {
    const card = await page.locator('.hm-root').boundingBox();

    await openExport(page);
    await clickItem(page, '複製文字');
    await page.waitForTimeout(300);
    const text = await readClipboardText(page);
    assertPasteable(text, {
      label: '指派分布 複製文字',
      must: ['指派分布', '位', '王小明（兄）', '份'],
    });
    assert.match(dialogs.at(-1) ?? '', /已複製指派分布文字/, 'no copy confirmation alert');

    await openExport(page);
    const jpg = await download(page, () => clickItem(page, '匯出 JPG'));
    assert.match(jpg.suggested, /^指派分布_.*\.jpg$/, `unexpected name ${jpg.suggested}`);
    const size = jpegSize(fs.readFileSync(jpg.file));
    const drift = Math.abs(size.width / 2 - card.width) / card.width;
    assert.ok(drift <= 0.02, `heatmap JPG is ${size.width / 2}px wide, card is ${card.width.toFixed(0)}px`);

    await clearClipboard(page);
    await openExport(page);
    await clickItem(page, '複製圖片到剪貼簿');
    const png = await waitForClipboardPng(page);
    assert.ok(png, 'the clipboard holds no image after heatmap 複製圖片');
    const image = decodePng(Buffer.from(png, 'base64'));
    assert.ok(Math.abs(image.width / 2 - card.width) / card.width <= 0.02, `heatmap clipboard PNG is ${image.width}px wide`);

    await openExport(page);
    const xlsx = await download(page, () => clickItem(page, '匯出 Excel'));
    const book = await readXlsx(xlsx.file);
    assert.ok(book.text.includes('姓名') && book.text.includes('件數'), 'heatmap xlsx lost its header');
    assert.ok(book.text.includes('王小明'), 'heatmap xlsx is missing the roster');
    assert.doesNotMatch(book.text, /undefined|\[object /);

    await openExport(page);
    const pdf = await download(page, () => clickItem(page, '下載 PDF'));
    readPdf(pdf.file, { pages: 1, images: 1 });
    assertSilent({ errors, dialogs }, '指派分布 總覽', 1);
  } finally {
    await page.close();
  }
});

test('指派分布 個人檢視: 文字 / JPG / PDF', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'heatmap');
  try {
    await page.locator('.hm-name').first().click();
    const detail = page.locator('.hm-person');
    await detail.waitFor({ state: 'visible', timeout: 30_000 });
    const name = await page.locator('.hm-person__name').textContent();

    await openExport(page);
    await clickItem(page, '複製文字');
    await page.waitForTimeout(300);
    const text = await readClipboardText(page);
    assertPasteable(text, {
      label: '個人檢視 複製文字',
      must: [name, '指派記錄：', '2026/', '份指派'],
    });
    assert.match(text, new RegExp(`${name}（(弟兄|姊妹)）`), 'the person text lost the gender label');

    const box = await detail.boundingBox();
    await openExport(page);
    const jpg = await download(page, () => clickItem(page, '匯出 JPG'));
    assert.match(jpg.suggested, new RegExp(`^${name}-指派分布_.*\\.jpg$`), `unexpected name ${jpg.suggested}`);
    const size = jpegSize(fs.readFileSync(jpg.file));
    assert.ok(Math.abs(size.width / 2 - box.width) / box.width <= 0.02, `person JPG is ${size.width / 2}px wide`);

    await openExport(page);
    const pdf = await download(page, () => clickItem(page, '下載 PDF'));
    readPdf(pdf.file, { pages: 1, images: 1 });
    assertSilent({ errors, dialogs }, '指派分布 個人檢視', 1);
  } finally {
    await page.close();
  }
});

/* ===================== 人員 iCal ===================== */

test('人員 iCal downloads a real calendar file; 複製行事曆連結 copies the page URL', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'people', { init: freezePeopleClock });
  try {
    await page.locator('.person', { hasText: '王小明' }).first().click();
    const icalButton = page.getByRole('button', { name: /iCal/ });
    await icalButton.waitFor({ state: 'visible', timeout: 30_000 });
    assert.match(await icalButton.textContent(), /↓ iCal \(\d+\)/, 'the iCal button reports no upcoming assignments');

    const [event] = await Promise.all([page.waitForEvent('download'), icalButton.click()]);
    const file = path.join(OUT, `people-${event.suggestedFilename()}`);
    await event.saveAs(file);
    assert.equal(event.suggestedFilename(), '王小明-schedule.ics');
    const ics = fs.readFileSync(file, 'utf8');
    assert.match(ics, /^BEGIN:VCALENDAR/, 'not an iCalendar file');
    assert.match(ics, /VERSION:2\.0/);
    assert.match(ics, /BEGIN:VEVENT/);
    assert.match(ics, /DTSTART;TZID=Asia\/Taipei:\d{8}T\d{6}/);
    assert.match(ics, /SUMMARY:主席/);
    assert.match(ics, /UID:.*@fixture/, 'the UID lost the congregation code');
    assert.match(ics, /END:VCALENDAR$/);

    await page.getByRole('button', { name: '複製行事曆連結' }).click();
    await page.waitForTimeout(800);
    const text = await readClipboardText(page);
    assert.equal(text, 'https://example.test/cal/fixture-token');
    assert.match(dialogs.at(-1) ?? '', /已複製行事曆連結/, 'no confirmation alert for the calendar link');

    assertSilent({ errors, dialogs }, '人員 iCal', 1);
  } finally {
    await page.close();
  }
});

/* ===================== 總覽 複製文字 ===================== */

test('總覽 最近變更 複製文字 copies the change log', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'overview', { init: freezeOverviewClock });
  try {
    await page.getByRole('tab', { name: '最近變更' }).click();
    const copy = page.getByRole('button', { name: '複製文字' });
    await copy.waitFor({ state: 'visible', timeout: 30_000 });
    await copy.click();
    await page.waitForTimeout(400);
    const text = await readClipboardText(page);
    // The panel formats "M/D HH:MM | 名字 → 日期 項目 (原:舊名)".
    assert.match(text, /^9\/2 08:05 \| 王小明 → 9月 9日 主席 \(原:陳大文\)$/m, `unexpected change text:\n${text}`);
    assert.match(text, /\[清除\] 9月 16日 開始禱告/);
    assert.match(dialogs.at(-1) ?? '', /已複製到剪貼簿/, 'no copy confirmation alert');
    assertSilent({ errors, dialogs }, '總覽 複製文字', 1);
  } finally {
    await page.close();
  }
});

/* ===================== 書刊 S-28 列印 ===================== */

test('書刊 S-28 列印 opens the report and calls print(), dropping the action bar', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'countsheet');
  try {
    await page.getByRole('button', { name: '更多選項' }).click();
    await page.getByRole('menuitem', { name: 'S-28 表' }).click();
    const printArea = page.locator('.lit-print-area');
    await printArea.waitFor({ state: 'visible', timeout: 30_000 });

    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 120_000 }),
      page.getByRole('button', { name: '列印' }).click(),
    ]);
    await popup.waitForFunction(() => (window.__printed ?? 0) > 0, undefined, { timeout: 30_000 });
    const body = await popup.evaluate(() => document.body.innerText);
    assert.match(body, /2026-10 存書月結記錄 S-28/);
    assert.match(body, /項目編號/);
    assert.match(body, /新世界譯本/, 'the printed report lost its rows');
    // data-print-hide must be stripped before printing.
    assert.equal(await popup.locator('.lit-report-actions').count(), 0, 'the action bar was printed');
    assertSilent({ errors, dialogs }, '書刊 S-28');
  } finally {
    await page.close();
  }
});

/* ===================== 服務 ===================== */

test('服務 匯出: 下載 PDF and 匯出 JPG produce the month sheet', { timeout: 300_000 }, async () => {
  const { page, errors, dialogs } = await openFixture(context, 'services');
  try {
    await page.waitForFunction(() => document.querySelectorAll('.service-tabs button').length > 1);
    const nodeSizes = await page.evaluate(() => [...document.querySelectorAll('.print-stage--services > *')]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, height: rect.height };
      }));
    assert.equal(nodeSizes.length, 1, 'the services sheet did not render');

    await openExport(page);
    const pdf = await download(page, () => clickItem(page, '下載 PDF'));
    assert.match(pdf.suggested, /^服務_.*\.pdf$/);
    const parsed = readPdf(pdf.file, { pages: 1, images: 1 });
    assert.ok(Math.abs(parsed.images[0].width / 2 - nodeSizes[0].width) / nodeSizes[0].width <= 0.02);

    await openExport(page);
    // The menu closes while the stage re-renders, so wait for the button back.
    const jpg = await download(page, () => clickItem(page, '匯出 JPG'));
    assert.match(jpg.suggested, /^服務_.*\.jpg$/);
    const size = jpegSize(fs.readFileSync(jpg.file));
    assert.equal(size.width, 1920, `服務 JPG is ${size.width}px wide`);
    const drift = Math.abs(size.height / 2 - nodeSizes[0].height) / nodeSizes[0].height;
    assert.ok(drift <= 0.02, `服務 JPG is ${(size.height / 2).toFixed(0)}px tall, sheet is ${nodeSizes[0].height.toFixed(0)}px`);
    assertSilent({ errors, dialogs }, '服務 匯出');
  } finally {
    await page.close();
  }
});

/* ===================== clock freezes ===================== */

// 週末 resolves "M/D" to the nearest future date then filters by year; freezing
// inside the fixture year keeps every row visible (see weekend-pdf.e2e.mjs).
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

// The 人員 fixture's weeks are 9月 of the fixture year; stand at 2026-09-01 so
// they (and the 9月 weekend rows) count as 未來安排 — the list ↓ iCal exports.
function freezePeopleClock() {
  const fixed = new Date('2026-09-01T09:00:00').getTime();
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

// The 總覽 change log renders timestamps from ISO strings; freeze so the copied
// text is stable ("9/2 08:05" in Asia/Taipei). Self-contained: an init script is
// serialized into the page, so it cannot close over this module's helpers.
function freezeOverviewClock(iso) {
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
