// Phone toolbar control sizing: every interactive control in a page toolbar
// row is a >=44px tap target at 390x844, and the heights agree within 2px.
// Fixtures only (real components, synthetic data) — no login or database.
//
//   npm run test:e2e
//
// Set BASE_URL to test an already-running server instead of spawning `next dev`.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

import { startDevServer } from './helpers.mjs';

const ROUTE = '/test-fixtures/exports';
const VIEWPORT = { width: 390, height: 844 };

// name, fixture route, toolbar row selector. Some fixtures expose two rows
// (熱點: export + filters; 書刊: header + count chips) — both are checked.
const PAGES = [
  ['服務', 'services', '.service-toolbar'],
  ['週中', 'midweek', '.mw-container > .toolbar'],
  ['週末', 'weekend', '.toolbar'],
  ['總覽', 'overview', '.toolbar.page-filters'],
  ['總覽篩選', 'overview', '.ov-chips'],
  ['人員', 'people', '.people-header'],
  ['書刊', 'countsheet', '.lit-header'],
  ['書刊清點', 'countsheet', '.lit-count-filter-row'],
  ['指派分布', 'heatmap', '.hm-header'],
  ['指派分布篩選', 'heatmap', '.hm-filters'],
  ['匯出', 'import', '.toolbar'],
];

let server;
let baseUrl;
let browser;

before(async () => {
  const started = await startDevServer(`${ROUTE}/services`);
  baseUrl = started.baseUrl;
  server = started.stop;
  browser = await chromium.launch();
}, { timeout: 300_000 });

after(async () => {
  await browser?.close();
  server?.();
});

async function controlHeights(route, selector) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  try {
    await page.goto(`${baseUrl}${ROUTE}/${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const status = document.querySelector('[data-testid="fixture-status"]');
      if (status) return status.textContent === 'fixture ready' || document.body.innerText.trim().length > 20;
      return document.body.innerText.trim().length > 20;
    }, null, { timeout: 180_000 });
    await page.waitForSelector(selector, { timeout: 60_000 });
    await page.evaluate(() => document.fonts?.ready);
    return await page.evaluate((sel) => {
      const bar = document.querySelector(sel);
      if (!bar) return null;
      // The visual controls: buttons (incl. dropdown triggers), selects and
      // the people search input. Hidden menu panels are not in the DOM until
      // opened, and off-screen nodes have no client rects.
      return [...bar.querySelectorAll('button, select, input')]
        .filter((el) => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
        .map((el) => ({
          label: (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 16),
          height: +el.getBoundingClientRect().height.toFixed(2),
        }));
    }, selector);
  } finally {
    await page.close();
  }
}

for (const [name, route, selector] of PAGES) {
  test(`390px ${name}: toolbar controls are equal height and >= 44px`, { timeout: 180_000 }, async () => {
    const controls = await controlHeights(route, selector);
    assert.ok(controls, `${name}: toolbar row ${selector} was not found`);
    if (controls.length === 0) {
      // 匯入/匯出 only shows its 重新上傳 button after a file reaches review.
      assert.equal(name, '匯出', `${name}: toolbar has no controls to measure`);
      return;
    }
    const detail = controls.map((c) => `${c.label}=${c.height}px`).join(', ');
    for (const c of controls) {
      assert.ok(c.height >= 44, `${name}: ${c.label} is ${c.height}px, expected >= 44px (${detail})`);
    }
    const heights = controls.map((c) => c.height);
    const spread = Math.max(...heights) - Math.min(...heights);
    assert.ok(spread <= 2, `${name}: control heights differ by ${spread}px (${detail})`);
  });
}
