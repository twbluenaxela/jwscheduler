// End-to-end guard for the 週中 PDF captures.
//
// The 匯出 page screenshots off-screen cards (.mw-pdf-captures) and places those
// images on A4 pages. Two things can silently break that and only show up on
// paper: a change to the row markup (main block vs assignees) that the capture
// CSS no longer matches, and a phone viewport whose media queries leak into the
// off-screen capture. So this test renders the fixture route at a phone and a
// desktop size, with body.editing on and off, checks the capture geometry, and
// then downloads the real PDFs and inspects them.
//
//   npm run test:e2e
//
// Set BASE_URL to test an already-running server instead of spawning `next dev`.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

import { DEFAULT_LAYOUT, normalizeLayout, paginate } from '../../app/lib/pdfLayout.mjs';
import { isMidweekSuspended } from '../../app/lib/weekType.mjs';
import { FIXTURE_WEEKS } from '../../app/test-fixtures/midweek-pdf/fixtureWeeks.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const ARTIFACTS = path.join(HERE, 'artifacts');
const FIXTURE_PATH = '/test-fixtures/midweek-pdf';

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
];

const CARD_WIDTH = 960;
const GRID_LAYOUT = normalizeLayout({ ...DEFAULT_LAYOUT, count: 2 });

let server = null;
let browser = null;
let baseUrl = process.env.BASE_URL ?? '';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return;
    } catch {
      // Server not up yet, or still compiling the route.
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not answer 200 at ${url}`);
}

before(async () => {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  if (!baseUrl) {
    const port = await freePort();
    // `localhost`, not 127.0.0.1: Next dev blocks cross-origin dev resources for
    // a bare IP host, and the blocked HMR client leaves the page unhydrated.
    baseUrl = `http://localhost:${port}`;
    server = spawn('npx', ['next', 'dev', '-p', String(port)], {
      cwd: ROOT,
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    });
  }
  await waitForServer(`${baseUrl}${FIXTURE_PATH}`);
  browser = await chromium.launch();
}, { timeout: 180_000 });

after(async () => {
  await browser?.close();
  if (server?.pid) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch { /* already gone */ }
  }
});

/* ===================== DOM geometry ===================== */

// Returns a list of human-readable failures instead of throwing inside the page,
// so one broken row reports every symptom at once.
function inspectCaptures(cardWidth) {
  const out = [];
  const root = document.querySelector('.mw-pdf-captures');
  if (!root) return ['no .mw-pdf-captures block'];

  const cards = [...root.querySelectorAll('article')];
  if (!cards.length) return ['no capture cards'];

  const hiddenSelectors = ['.mw-editbar', '.mw-seam', '.mw-inline', '.mw-addinline', '.mw-snack', '.who--ghost-add', '.mw-band-end'];
  const visible = (el) => {
    const style = getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
  };

  cards.forEach((card, cardIndex) => {
    const cardRect = card.getBoundingClientRect();
    const where = `card ${cardIndex}`;

    if (Math.abs(cardRect.width - cardWidth) > 1) {
      out.push(`${where}: width ${cardRect.width} != ${cardWidth}`);
    }

    const style = getComputedStyle(card);
    if (style.backgroundColor !== 'rgb(255, 255, 255)') out.push(`${where}: background ${style.backgroundColor}`);
    if (style.boxShadow !== 'none') out.push(`${where}: box-shadow ${style.boxShadow}`);

    for (const selector of hiddenSelectors) {
      card.querySelectorAll(selector).forEach((el) => {
        if (visible(el)) out.push(`${where}: ${selector} is visible`);
      });
    }

    // Nothing may poke out of the card horizontally — the capture would clip it.
    card.querySelectorAll('*').forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      if (rect.left < cardRect.left - 1 || rect.right > cardRect.right + 1) {
        out.push(`${where}: ${el.className || el.tagName} overflows (${Math.round(rect.left)}..${Math.round(rect.right)})`);
      }
    });

    const rows = [...card.querySelectorAll('.row')].filter((row) => row.querySelector('.row__part'));
    rows.forEach((row) => {
      const main = row.querySelector('.row__main');
      const time = row.querySelector('.row__time');
      const dot = row.querySelector('.dot');
      const part = row.querySelector('.row__part');
      const assign = row.querySelector('.row__assign');
      const key = row.dataset.partKey ?? row.textContent.trim().slice(0, 12);

      const mainRect = main.getBoundingClientRect();
      if (mainRect.width < cardRect.width * 0.5) {
        out.push(`${where}/${key}: row__main only ${Math.round(mainRect.width)}px wide`);
      }
      if (!time || !dot || !part) return;

      const tops = [time, dot, part].map((el) => el.getBoundingClientRect().top);
      if (Math.max(...tops) - Math.min(...tops) > 6) {
        out.push(`${where}/${key}: time/dot/title tops differ (${tops.map(Math.round).join(', ')})`);
      }
      const partRect = part.getBoundingClientRect();
      const timeRect = time.getBoundingClientRect();
      if (partRect.left - timeRect.left > 100) {
        out.push(`${where}/${key}: title starts ${Math.round(partRect.left - timeRect.left)}px after the time`);
      }
      if (assign) {
        const assignRect = assign.getBoundingClientRect();
        if (cardRect.right - assignRect.right > 30) {
          out.push(`${where}/${key}: assignees ${Math.round(cardRect.right - assignRect.right)}px from the card edge`);
        }
        if (assignRect.width > 0 && assignRect.left < partRect.right - 1) {
          out.push(`${where}/${key}: assignees overlap the title column`);
        }
      }
    });
  });

  if (!root.querySelectorAll('.row .row__part').length) out.push('no .row with a .row__part to check');

  return out;
}

/* ===================== PDF parsing ===================== */

function countPdfPages(bytes) {
  return (Buffer.from(bytes).toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

function pdfImageSizes(bytes) {
  const text = Buffer.from(bytes).toString('latin1');
  const sizes = [];
  const re = /\/Subtype\s*\/Image\s*\/Width\s+(\d+)\s*\/Height\s+(\d+)/g;
  let match = re.exec(text);
  while (match) {
    sizes.push({ width: Number(match[1]), height: Number(match[2]) });
    match = re.exec(text);
  }
  return sizes;
}

function checkPdf(filePath, expectedPages, cardSizes) {
  const bytes = fs.readFileSync(filePath);
  assert.equal(bytes.subarray(0, 5).toString('latin1'), '%PDF-', `${path.basename(filePath)} is not a PDF`);

  assert.equal(
    countPdfPages(bytes),
    expectedPages,
    `${path.basename(filePath)}: expected ${expectedPages} pages`,
  );

  const images = pdfImageSizes(bytes);
  assert.equal(images.length, cardSizes.length, `${path.basename(filePath)}: one embedded image per captured week`);

  images.forEach((img, index) => {
    const ratio = img.width / img.height;
    const closest = Math.min(...cardSizes.map((card) => {
      const cardRatio = card.width / card.height;
      return Math.abs(cardRatio - ratio) / cardRatio;
    }));
    assert.ok(closest <= 0.02, `${path.basename(filePath)}: image ${index} aspect ratio is ${(closest * 100).toFixed(1)}% off a card`);
  });
}

/* ===================== Capture ===================== */

async function downloadPdfs(page, label) {
  const gridPath = path.join(ARTIFACTS, `${label}-grid.pdf`);
  const [gridDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => window.__exportGrid(2)),
  ]);
  await gridDownload.saveAs(gridPath);

  const pdfPath = path.join(ARTIFACTS, `${label}-weeks.pdf`);
  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => window.__exportPdf()),
  ]);
  await pdfDownload.saveAs(pdfPath);

  return { gridPath, pdfPath };
}

async function screenshotCards(page, label) {
  // The block lives off-screen (left: -99999px) so it never shows in the app;
  // put it back into the document flow just long enough to take each card's
  // picture, so Playwright can scroll a card taller than the viewport into view.
  // Position does not affect the internal layout the exports depend on.
  await page.addStyleTag({
    content: '.mw-pdf-captures { position: static !important; left: auto !important; top: auto !important; pointer-events: auto !important; }',
  });
  // The Next dev-tools badge is fixed to the viewport and would be baked into an
  // element screenshot; it is dev-only chrome, not part of the card.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
  const cards = page.locator('.mw-pdf-captures article');
  const count = await cards.count();
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await cards.nth(i).screenshot({ path: path.join(ARTIFACTS, `${label}-card-${i}.png`) });
  }
}

/* ===================== Tests ===================== */

for (const viewport of VIEWPORTS) {
  for (const editing of [false, true]) {
    const label = `${viewport.name}-${editing ? 'editing' : 'read'}`;

    test(`captures print correctly at ${viewport.width}x${viewport.height} (${editing ? 'body.editing' : 'read mode'})`, { timeout: 240_000 }, async () => {
      const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
      try {
        const url = `${baseUrl}${FIXTURE_PATH}${editing ? '?editing=1' : ''}`;
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(
          () => document.querySelector('[data-testid="fixture-status"]')?.textContent === 'fixture ready'
            && typeof window.__exportPdf === 'function'
            && document.querySelectorAll('.mw-pdf-captures article').length === 4,
          undefined,
          { timeout: 120_000 },
        );
        if (editing) {
          assert.equal(await page.evaluate(() => document.body.classList.contains('editing')), true, 'body.editing was not applied');
        }
        // Let the fonts settle so nothing re-wraps after the geometry checks.
        await page.evaluate(() => document.fonts?.ready);
        await page.waitForTimeout(150);

        const failures = await page.evaluate(inspectCaptures, CARD_WIDTH);
        assert.deepEqual(failures, [], `capture geometry at ${label}:\n${failures.join('\n')}`);

        const cardSizes = await page.evaluate(() => [...document.querySelectorAll('.mw-pdf-captures article')]
          .map((card) => {
            const rect = card.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          }));
        assert.equal(cardSizes.length, FIXTURE_WEEKS.length, 'one capture card per fixture week');

        const { gridPath, pdfPath } = await downloadPdfs(page, label);
        // The grid packs N weeks per page; a suspended week rides along as a
        // full-width notice band instead of using up a box.
        checkPdf(gridPath, paginate(FIXTURE_WEEKS, GRID_LAYOUT, isMidweekSuspended).length, cardSizes);
        checkPdf(pdfPath, FIXTURE_WEEKS.length, cardSizes);

        await screenshotCards(page, label);
      } finally {
        await page.close();
      }
    });
  }
}
