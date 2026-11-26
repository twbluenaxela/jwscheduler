// iPad fit audit. A whole 週中 card — header through the 結語/結束禱告 row —
// must sit above Safari's toolbars on iPad viewports, in read AND edit mode,
// and every page must fit its viewport horizontally.
//
//   npm run test:e2e
//
// Set BASE_URL to test an already-running server instead of spawning `next dev`.
// Fixture routes are used (synthetic data only) so the suite needs no login or
// database, and so it does not depend on the gitignored local dev-preview pages.

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { chromium } from 'playwright';

import { ensureArtifacts, startDevServer } from './helpers.mjs';

const ROUTE = '/test-fixtures/exports';

// Safari's toolbars eat ~80px of the nominal viewport.
const TOOLBAR = 80;
const VIEWPORTS = [
  { name: 'iPad Air 10th portrait', width: 820, height: 1180 },
  { name: 'iPad Air 10th landscape', width: 1180, height: 820 },
  { name: 'iPad mini portrait', width: 744, height: 1133 },
  { name: 'iPad Pro 11 landscape', width: 1194, height: 834 },
];
// 書刊 is represented by its tracked S-28 fixture; 匯出 by the 匯入/匯出 page
// fixture. These mount the same real components as the app pages.
const PAGES = [
  ['總覽', 'overview'],
  ['週末', 'weekend'],
  ['服務', 'services'],
  ['人員', 'people'],
  ['書刊', 'countsheet'],
  ['匯出', 'import'],
];

let server;
let baseUrl;
let browser;
const contexts = new Map();

before(async () => {
  ensureArtifacts();
  const started = await startDevServer(`${ROUTE}/midweek`);
  baseUrl = started.baseUrl;
  server = started.stop;
  browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    // eslint-disable-next-line no-await-in-loop
    contexts.set(vp.name, await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    }));
  }
}, { timeout: 300_000 });

after(async () => {
  for (const ctx of contexts.values()) await ctx.close();
  await browser?.close();
  server?.();
});

async function openFixture(ctx, route, query = '', { requireReady = false } = {}) {
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}${ROUTE}/${route}${query}`, { waitUntil: 'domcontentloaded' });
  // The 服務 fixture reuses the services-pdf fixture (no status pill), and the
  // 週末 fixture only reports "ready" once its off-screen print chunks mount —
  // which the year gate can suppress. Neither matters for a layout audit; the
  // midweek card check still waits for the real fixture-ready signal.
  await page.waitForFunction((strict) => {
    const status = document.querySelector('[data-testid="fixture-status"]');
    if (strict) return status?.textContent === 'fixture ready';
    return status ? status.textContent === 'fixture ready' || document.body.innerText.trim().length > 20
      : document.body.innerText.trim().length > 20;
  }, requireReady, { timeout: 180_000 });
  await page.evaluate(() => document.fonts?.ready);
  await page.waitForTimeout(200);
  return page;
}

// The card the person actually looks at: the fixture also renders the fixed,
// off-screen print-stage card, which is NOT the thing that has to fit.
const CARD = 'main > .card';

async function cardGeometry(page) {
  return page.evaluate((selector) => {
    const visibleHeight = (sel) => {
      const el = document.querySelector(sel);
      if (!el || getComputedStyle(el).display === 'none') return 0;
      return el.getBoundingClientRect().height;
    };
    const card = document.querySelector(selector);
    const rect = card?.getBoundingClientRect();
    const rows = [...card.querySelectorAll('.rows .row')];
    const closing = rows.find((row) => (row.textContent || '').includes('結語'));
    const names = [...card.querySelectorAll('.who:not(.who--ghost-add)')];
    return {
      innerHeight: window.innerHeight,
      chrome: visibleHeight('.topbar') + visibleHeight('.tabbar'),
      card: rect ? { top: rect.top, bottom: rect.bottom, height: rect.height } : null,
      closingBottom: closing?.getBoundingClientRect().bottom ?? null,
      minFont: Math.min(...[...card.querySelectorAll(
        '.row__part, .who, .row__time, .partnum, .role-label, .band__title, .mw-band-end',
      )].map((el) => parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite)),
      minTap: Math.min(...[...card.querySelectorAll('.row__main, .who:not(.who--ghost-add)')]
        .map((el) => el.getBoundingClientRect().height).filter((h) => h > 0)),
      clippedNames: names.filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => (el.textContent || '').trim()),
    };
  }, CARD);
}

for (const vp of VIEWPORTS) {
  test(`${vp.name}: 週中 card fits above the Safari toolbar in view + edit mode`, { timeout: 180_000 }, async () => {
    const ctx = contexts.get(vp.name);
    for (const [mode, query] of [['view', ''], ['edit', '?editing=1']]) {
      const page = await openFixture(ctx, 'midweek', query, { requireReady: true });
      try {
        assert.equal(
          await page.evaluate(() => document.body.classList.contains('editing')),
          mode === 'edit',
          `${mode}: wrong body.editing state`,
        );
        const g = await cardGeometry(page);
        const usable = g.innerHeight - TOOLBAR - g.chrome;
        assert.ok(g.card, `${mode}: no live card found`);
        assert.ok(
          g.card.bottom <= usable + 1,
          `${vp.name} ${mode}: card bottom ${g.card.bottom.toFixed(1)}px exceeds usable height ${usable}px `
            + `(card ${g.card.height.toFixed(1)}px, top ${g.card.top.toFixed(1)}px)`,
        );
        assert.ok(
          g.closingBottom !== null && g.closingBottom <= usable + 1,
          `${vp.name} ${mode}: the 結語/結束禱告 row ends at ${g.closingBottom}px, below ${usable}px`,
        );
        assert.ok(g.minFont >= 13, `${vp.name} ${mode}: text is ${g.minFont}px, below 13px`);
        assert.ok(g.minTap >= 32, `${vp.name} ${mode}: tap target is ${g.minTap}px, below 32px`);
        assert.deepEqual(g.clippedNames, [], `${vp.name} ${mode}: assignee names are truncated`);
      } finally {
        await page.close();
      }
    }
  });

  test(`${vp.name}: no horizontal overflow on 總覽 / 週末 / 服務 / 人員 / 書刊 / 匯出`, { timeout: 180_000 }, async () => {
    const ctx = contexts.get(vp.name);
    for (const [label, route] of PAGES) {
      const page = await openFixture(ctx, route);
      try {
        const m = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        assert.ok(
          m.scrollWidth <= m.innerWidth + 1,
          `${vp.name} ${label}: scrollWidth ${m.scrollWidth} exceeds innerWidth ${m.innerWidth}`,
        );
      } finally {
        await page.close();
      }
    }
  });
}
