// Round-2 layout guards: shared desktop grid, phone heatmap scrolling, services
// toolbar, and the dense people list. Fixtures only; no login or database.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright';

import { startDevServer } from './helpers.mjs';

const ROUTE = '/test-fixtures/exports';
let server;
let baseUrl;
let browser;

before(async () => {
  const started = await startDevServer(`${ROUTE}/people`);
  baseUrl = started.baseUrl;
  server = started.stop;
  browser = await chromium.launch();
}, { timeout: 300_000 });

after(async () => {
  await browser?.close();
  server?.();
});

async function open(route, width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(`${baseUrl}${ROUTE}/${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, { timeout: 60_000 });
  await page.evaluate(() => document.fonts?.ready);
  return page;
}

async function tracks(page, selector) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    return getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
  }, selector);
}

test('1180px landscape: overview, services and countsheet use the shared two-column grid', { timeout: 120_000 }, async () => {
  for (const [route, selector] of [
    ['overview', '.ag-months'],
    ['services', '.service-field-list'],
    ['countsheet', '.lit-count-sections'],
  ]) {
    const page = await open(route, 1180, 820);
    try {
      await page.waitForSelector(selector, { timeout: 30_000 });
      const n = await tracks(page, selector);
      assert.equal(n, 2, `${route}: ${selector} has ${n} columns, expected 2`);
      const m = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, iw: innerWidth }));
      assert.ok(m.w <= m.iw + 1, `${route}: horizontal overflow ${m.w} > ${m.iw}`);
    } finally {
      await page.close();
    }
  }
});

test('820px portrait: single-column grid stays balanced without overflow', { timeout: 120_000 }, async () => {
  for (const [route, selector] of [
    ['overview', '.ag-months'],
    ['services', '.service-field-list'],
    ['countsheet', '.lit-count-sections'],
  ]) {
    const page = await open(route, 820, 1180);
    try {
      await page.waitForSelector(selector, { timeout: 30_000 });
      const n = await tracks(page, selector);
      assert.equal(n, 1, `${route}: ${selector} has ${n} columns at iPad portrait, expected 1`);
      const m = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, iw: innerWidth }));
      assert.ok(m.w <= m.iw + 1, `${route}: horizontal overflow ${m.w} > ${m.iw}`);
    } finally {
      await page.close();
    }
  }
});

test('390px heatmap: page scrolls the roster, no fixed-height nested scroller, cue visible', { timeout: 120_000 }, async () => {
  const page = await open('heatmap', 390, 844);
  try {
    const m = await page.evaluate(() => {
      const root = document.querySelector('.hm-root');
      const cue = document.querySelector('.hm-scrollcue');
      return {
        maxHeight: getComputedStyle(root).maxHeight,
        cueVisible: !!cue && getComputedStyle(cue).display !== 'none',
        rows: document.querySelectorAll('.hm-row').length,
        pageScrollable: document.documentElement.scrollHeight > innerHeight,
      };
    });
    assert.equal(m.maxHeight, 'none', `hm-root max-height is ${m.maxHeight}`);
    assert.equal(m.cueVisible, true, 'heatmap scroll cue is hidden');
    assert.ok(m.rows >= 10, `only ${m.rows} roster rows`);
    assert.equal(m.pageScrollable, true, 'roster does not scroll with the page');
  } finally {
    await page.close();
  }
});

test('390px services: month + 新增 + 匯出 share one row, tab cue and accessible export remain', { timeout: 120_000 }, async () => {
  const page = await open('services', 390, 844);
  try {
    await page.waitForSelector('.service-toolbar', { timeout: 30_000 });
    const m = await page.evaluate(() => {
      const t = document.querySelector('.service-toolbar').getBoundingClientRect();
      const add = document.querySelector('.service-add-button').getBoundingClientRect();
      const cue = document.querySelector('.service-tabs-cue');
      return {
        toolbarH: Math.round(t.height),
        addY: Math.round(add.y - t.y),
        cueOn: cue?.classList.contains('is-on'),
        scrollW: document.documentElement.scrollWidth,
        innerW: innerWidth,
      };
    });
    assert.ok(m.toolbarH <= 60, `service toolbar is ${m.toolbarH}px tall, expected one row`);
    assert.ok(m.addY >= 0 && m.addY < 20, '新增 is not on the toolbar row');
    assert.equal(m.cueOn, true, 'tab overflow cue is off');
    assert.ok(m.scrollW <= m.innerW + 1, 'services overflow horizontally');
    const trigger = page.getByRole('button', { name: /匯出/ });
    assert.equal(await trigger.count(), 1, 'no accessible 匯出 trigger');
    assert.equal(await trigger.isVisible(), true, '匯出 trigger is not visible');
  } finally {
    await page.close();
  }
});

test('1440px people: dense full-width list with aligned columns', { timeout: 120_000 }, async () => {
  const page = await open('people', 1440, 900);
  try {
    const m = await page.evaluate(() => {
      const list = document.querySelector('.people-list');
      const person = document.querySelector('.person');
      return {
        listW: Math.round(list.getBoundingClientRect().width),
        cols: getComputedStyle(person).gridTemplateColumns.split(' ').filter(Boolean).length,
        left: Math.round(list.getBoundingClientRect().x),
      };
    });
    assert.ok(m.listW >= 1200, `people list is only ${m.listW}px wide`);
    assert.ok(m.cols >= 6, `person rows have only ${m.cols} columns`);
    assert.ok(m.left < 60, `people list starts at x=${m.left}, not left-aligned`);
  } finally {
    await page.close();
  }
});

const ALIGN_CASES = [
  ['overview', '.toolbar.page-filters', '#ovBody'],
  ['services', '.service-toolbar', '.service-field-list'],
  ['countsheet', '.lit-count-header', '.lit-count-sections'],
  ['people', '.people-header', '.people-list'],
];

test('1180/1440/1920px: page header right edge matches content right edge', { timeout: 240_000 }, async () => {
  for (const width of [1180, 1440, 1920]) {
    for (const [route, headerSel, contentSel] of ALIGN_CASES) {
      const page = await open(route, width, 900);
      try {
        await page.waitForSelector(contentSel, { timeout: 30_000 });
        const m = await page.evaluate(([h, c]) => {
          const a = document.querySelector(h).getBoundingClientRect();
          const b = document.querySelector(c).getBoundingClientRect();
          return { right: Math.abs(a.right - b.right), left: Math.abs(a.left - b.left) };
        }, [headerSel, contentSel]);
        assert.ok(m.right <= 2, `${route} @${width}: header right ${m.right}px from content right`);
        assert.ok(m.left <= 2, `${route} @${width}: header left ${m.left}px from content left`);
      } finally {
        await page.close();
      }
    }
  }
});
