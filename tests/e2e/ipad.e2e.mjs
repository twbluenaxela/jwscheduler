// iPad fit audit. The whole 週中 card — header through the 結語/結束禱告 row —
// must sit above Safari's toolbars on iPad viewports, in read AND edit mode,
// with the UNCHANGED desktop card design zoomed to fit like a printed sheet.
// Phones and desktop keep their own layout entirely. Every page must also fit
// its viewport horizontally.
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
let desktopSignature;
const contexts = new Map();
const phoneContext = { name: 'phone', width: 390, height: 844 };
const desktopContext = { name: 'desktop', width: 1440, height: 900 };
// Still inside the iPad rail range; checked separately from the four canonical
// viewports so the main fit loop stays as specified.
const wideContext = { name: 'wide iPad', width: 1366, height: 1024 };
const RAIL_PAGES = ['overview', 'weekend', 'services', 'people', 'countSheet', 'import', 'settings'];

before(async () => {
  ensureArtifacts();
  const started = await startDevServer(`${ROUTE}/midweek`);
  baseUrl = started.baseUrl;
  server = started.stop;
  browser = await chromium.launch();
  for (const vp of [...VIEWPORTS, phoneContext, desktopContext, wideContext]) {
    // eslint-disable-next-line no-await-in-loop
    contexts.set(vp.name, await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
    }));
  }
  // The card's internal layout on a desktop is the reference every iPad must
  // reproduce — zoom changes size, never the row grid or the row order.
  const page = await openFixture(contexts.get(desktopContext.name), 'midweek', '', { requireReady: true });
  try {
    desktopSignature = await layoutSignature(page);
  } finally {
    await page.close();
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
  await page.waitForTimeout(500);
  return page;
}

// The card the person actually looks at: the fixture also renders the fixed,
// off-screen print-stage card, which is NOT the thing that has to fit. With the
// zoom wrapper active the live card sits one level deeper.
const CARD = '.mw-container .card';

async function cardGeometry(page) {
  return page.evaluate((selector) => {
    const visibleHeight = (sel) => {
      const el = document.querySelector(sel);
      if (!el || getComputedStyle(el).display === 'none') return 0;
      return el.getBoundingClientRect().height;
    };
    const card = document.querySelector(selector);
    const rect = card?.getBoundingClientRect();
    const contentEl = document.querySelector('.content');
    const contentStyle = getComputedStyle(contentEl);
    const contentLeft = contentEl.getBoundingClientRect().left + parseFloat(contentStyle.paddingLeft);
    const contentRight = contentEl.getBoundingClientRect().right - parseFloat(contentStyle.paddingRight);
    const rows = [...card.querySelectorAll('.rows .row')];
    const closing = rows.find((row) => (row.textContent || '').includes('結語'));
    const names = [...card.querySelectorAll('.who:not(.who--ghost-add)')];
    const boxes = (sel) => [...card.querySelectorAll(sel)].map((el) => el.getBoundingClientRect());
    const seams = boxes('.mw-seam');
    const times = boxes('.row__time');
    const hits = (a, b) => a.left < b.right - 0.5 && a.right > b.left + 0.5
      && a.top < b.bottom - 0.5 && a.bottom > b.top + 0.5;
    const wrapper = document.querySelector('.fit-to-screen');
    const zoom = wrapper ? parseFloat(getComputedStyle(wrapper).zoom) : 1;
    const fonts = [...card.querySelectorAll(
      '.row__part, .who, .row__time, .partnum, .role-label, .band__title, .mw-band-end, .dur, .row__scenario, .cbs-ref, .mw-type-badge',
    )].map((el) => parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite);
    const size = (sel) => [...card.querySelectorAll(sel)]
      .map((el) => parseFloat(getComputedStyle(el).fontSize)).filter(Number.isFinite);
    const partLines = [...card.querySelectorAll('.row__part')].map((el) => {
      const line = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize);
      return el.getBoundingClientRect().height / line / zoom;
    });
    // Spreadsheet check: in every section, every assignee block, role label and
    // name must start/end at the same x within 2px.
    const sections = [];
    let section = null;
    for (const child of card.querySelector('.mw-body').children) {
      if (child.classList.contains('band')) {
        section = { name: child.textContent.trim(), assigns: [], roles: [], names: [] };
        sections.push(section);
      } else if (section) {
        for (const row of child.querySelectorAll('.row')) {
          const assign = row.querySelector('.row__assign');
          if (!assign) continue;
          section.assigns.push(assign.getBoundingClientRect().left);
          const label = assign.querySelector(':scope > .role-label');
          if (label) section.roles.push(label.getBoundingClientRect().right);
          const name = assign.querySelector(':scope > .who, :scope > .who--pair');
          if (name) section.names.push(name.getBoundingClientRect().left);
        }
      }
    }
    const spread = (values) => (values.length ? Math.max(...values) - Math.min(...values) : 0);
    const bands = [...card.querySelectorAll('.band')].map((el) => el.getBoundingClientRect());
    const overlap = (a, b) => a.left < b.right - 1 && a.right > b.left + 1
      && a.top < b.bottom - 1 && a.bottom > b.top + 1;
    const bandOverlaps = [...card.querySelectorAll('.row__assign, .who, .row__part, .role-label, .mw-seam, .mw-editbar .btn')]
      .filter((el) => bands.some((b) => overlap(el.getBoundingClientRect(), b)))
      .map((el) => (el.textContent || '').trim().slice(0, 20));
    const done = card.querySelector('.mw-editbar .btn')?.getBoundingClientRect();
    const headRect = card.querySelector('.mw-head').getBoundingClientRect();
    return {
      headHeight: card.querySelector('.mw-head').getBoundingClientRect().height / zoom,
      assignHeights: [...card.querySelectorAll('.row__assign')]
        .filter((el) => el.children.length).map((el) => el.getBoundingClientRect().height / zoom),
      bandOverlaps,
      doneInset: done ? rect.right - done.right : null,
      doneCentred: done ? Math.abs((done.top + done.bottom) / 2 - (headRect.top + headRect.bottom) / 2) : null,
      rowHeights: rows.map((row) => row.getBoundingClientRect().height / zoom),
      maxPartLines: partLines.length ? Math.max(...partLines) : 0,
      minTitle: size('.row__part-main').length ? Math.min(...size('.row__part-main')) : null,
      minName: size('.who').length ? Math.min(...size('.who')) : null,
      assignSpread: Math.max(...sections.flatMap((s) => [
        spread(s.assigns), spread(s.roles), spread(s.names),
      ])),
      innerHeight: window.innerHeight,
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      chrome: visibleHeight('.topbar') + visibleHeight('.tabbar'),
      card: rect ? {
        top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: rect.height,
      } : null,
      content: { left: contentLeft, right: contentRight },
      expectedRight: window.innerWidth - parseFloat(contentStyle.paddingRight),
      railWidth: document.querySelector('.sidenav')?.getBoundingClientRect().width ?? 0,
      railItems: [...document.querySelectorAll('.sidenav .navitem')].map((el) => ({
        label: el.getAttribute('aria-label'),
        title: el.title,
        iconW: el.querySelector('svg')?.getBoundingClientRect().width ?? 0,
        iconH: el.querySelector('svg')?.getBoundingClientRect().height ?? 0,
      })),
      toolbar: (() => {
        const el = document.querySelector('.mw-container > .toolbar');
        const r = el.getBoundingClientRect();
        return { height: r.height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      })(),
      navstrip: (() => {
        const el = document.querySelector('.mw-navstrip');
        const r = el.getBoundingClientRect();
        return { height: r.height, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
      })(),
      topbarDisplay: getComputedStyle(document.querySelector('.topbar')).display,
      tabbarDisplay: getComputedStyle(document.querySelector('.tabbar')).display,
      closingBottom: closing?.getBoundingClientRect().bottom ?? null,
      hasWrapper: Boolean(wrapper),
      scale: wrapper ? Number(wrapper.dataset.fitScale) : null,
      zoom,
      mwCols: card.querySelectorAll('.mw-col').length,
      seamOverlap: seams.some((s) => times.some((t) => hits(s, t))),
      minFont: fonts.length ? Math.min(...fonts) : null,
      effectiveMinFont: fonts.length ? Math.min(...fonts) * zoom : null,
      minTitleEff: size('.row__part-main').length ? Math.min(...size('.row__part-main')) * zoom : null,
      minNameEff: size('.who').length ? Math.min(...size('.who')) * zoom : null,
      clippedNames: names.filter((el) => el.scrollWidth > el.clientWidth + 1)
        .map((el) => (el.textContent || '').trim()),
    };
  }, CARD);
}

// Track shape and row order only: widths depend on the viewport, but the grid
// definition and the sequence of rows must be the desktop ones everywhere.
async function layoutSignature(page) {
  return page.evaluate((selector) => {
    const card = document.querySelector(selector);
    const round = (v) => Math.round(parseFloat(v) * 10) / 10;
    return [...card.querySelectorAll('.rows .row')].map((row) => {
      const grid = getComputedStyle(row);
      const main = getComputedStyle(row.querySelector('.row__main'));
      return {
        rowTracks: grid.gridTemplateColumns.split(/\s+/).length,
        mainTracks: main.gridTemplateColumns.split(/\s+/).length,
        mainTime: round(main.gridTemplateColumns.split(/\s+/)[0]),
        mainDot: round(main.gridTemplateColumns.split(/\s+/)[1]),
        areas: grid.gridTemplateAreas,
        key: row.dataset.partKey || '',
        kind: row.className.replace(/\brow--open\b/, '').trim(),
      };
    });
  }, CARD);
}

for (const vp of VIEWPORTS) {
  test(`${vp.name}: 週中 card zoom-to-fits above the Safari toolbar in view + edit mode`, { timeout: 180_000 }, async (t) => {
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
        assert.ok(g.hasWrapper, `${mode}: no zoom wrapper on the iPad card`);
        assert.equal(g.railWidth, 68, `${mode}: expected the 68px icon rail, got ${g.railWidth}px`);
        assert.equal(g.topbarDisplay, 'none', `${mode}: topbar must stay hidden on iPad`);
        assert.equal(g.tabbarDisplay, 'none', `${mode}: tabbar must stay hidden on iPad`);
        assert.ok(
          g.railItems.length > 0 && g.railItems.every((i) => i.label && i.title && i.iconW > 0 && i.iconH > 0),
          `${mode}: every rail item needs a visible icon and an accessible name: ${JSON.stringify(g.railItems)}`,
        );
        assert.ok(g.toolbar.height <= 48 && g.toolbar.scrollWidth <= g.toolbar.clientWidth + 1,
          `${mode}: real toolbar wraps or overflows (${JSON.stringify(g.toolbar)})`);
        assert.ok(g.navstrip.height <= 48 && g.navstrip.scrollWidth <= g.navstrip.clientWidth + 1,
          `${mode}: real navstrip wraps or overflows (${JSON.stringify(g.navstrip)})`);
        assert.ok(
          g.scale >= 0.6 && g.scale <= 1.6,
          `${mode}: scale ${g.scale} escaped the [0.6, 1.6] clamp`,
        );
        assert.ok(
          g.card.bottom <= usable + 1,
          `${vp.name} ${mode}: card bottom ${g.card.bottom.toFixed(1)}px exceeds usable height ${usable}px `
            + `(card ${g.card.height.toFixed(1)}px, top ${g.card.top.toFixed(1)}px)`,
        );
        assert.ok(
          g.card.bottom >= usable - 8,
          `${vp.name} ${mode}: card bottom ${g.card.bottom.toFixed(1)}px leaves a ${(usable - g.card.bottom).toFixed(1)}px gap above the usable bottom ${usable}px`,
        );
        assert.ok(
          Math.abs(g.card.left - g.content.left) <= 1 && Math.abs(g.card.right - g.content.right) <= 1,
          `${vp.name} ${mode}: card edges [${g.card.left.toFixed(1)}, ${g.card.right.toFixed(1)}] do not match content [${g.content.left.toFixed(1)}, ${g.content.right.toFixed(1)}]`,
        );
        assert.ok(
          Math.abs(g.card.right - g.expectedRight) <= 1,
          `${vp.name} ${mode}: card right ${g.card.right.toFixed(1)} is not the viewport right minus content padding (${g.expectedRight})`,
        );
        assert.ok(
          g.closingBottom !== null && g.closingBottom <= usable + 1,
          `${vp.name} ${mode}: the 結語/結束禱告 row ends at ${g.closingBottom}px, below ${usable}px`,
        );
        assert.ok(!g.seamOverlap, `${vp.name} ${mode}: a ＋ insert seam overlaps a .row__time box`);
        assert.equal(g.mwCols, 0, `${vp.name} ${mode}: tablet-only .mw-col wrapper is still present`);
        assert.deepEqual(
          await layoutSignature(page), desktopSignature,
          `${vp.name} ${mode}: card's row grid/order differs from the desktop design`,
        );
        assert.ok(g.headHeight <= 46, `${vp.name} ${mode}: header is ${g.headHeight.toFixed(1)}px tall, not one line`);
        assert.ok(
          Math.max(...g.rowHeights) - Math.min(...g.rowHeights) <= 1,
          `${vp.name} ${mode}: row heights ${g.rowHeights.map((h) => h.toFixed(1))} are not even`,
        );
        assert.ok(g.maxPartLines <= 2.05, `${vp.name} ${mode}: a part title takes ${g.maxPartLines.toFixed(1)} lines`);
        assert.deepEqual(g.clippedNames, [], `${vp.name} ${mode}: assignee names are truncated`);
        assert.ok(
          g.assignSpread <= 2,
          `${vp.name} ${mode}: assignee columns drift by ${g.assignSpread.toFixed(1)}px across a section`,
        );
        assert.ok(g.effectiveMinFont >= 11, `${vp.name} ${mode}: smallest effective font is ${g.effectiveMinFont.toFixed(2)}px`);
        assert.ok(g.minTitleEff >= 14, `${vp.name} ${mode}: part titles render at ${g.minTitleEff.toFixed(2)}px`);
        assert.ok(g.minNameEff >= 14, `${vp.name} ${mode}: names render at ${g.minNameEff.toFixed(2)}px`);
        if (mode === 'edit') {
          assert.deepEqual(g.bandOverlaps, [], `${vp.name} edit: elements overlap a section band: ${g.bandOverlaps}`);
          assert.ok(
            g.assignHeights.length > 0 && Math.max(...g.assignHeights) <= 28,
            `${vp.name} edit: assignee block wraps (${Math.max(...g.assignHeights).toFixed(1)}px)`,
          );
          assert.ok(g.doneInset >= 8, `${vp.name} edit: 完成 button is ${g.doneInset.toFixed(1)}px from the card edge`);
          assert.ok(g.doneCentred <= 2, `${vp.name} edit: 完成 button is off the header centre by ${g.doneCentred.toFixed(1)}px`);
        }
        assert.ok(
          g.scrollWidth <= g.innerWidth + 1,
          `${vp.name} ${mode}: scrollWidth ${g.scrollWidth} exceeds innerWidth ${g.innerWidth}`,
        );
        t.diagnostic(`${vp.name} ${mode}: scale ${g.scale?.toFixed(4)}, effective smallest font ${g.effectiveMinFont?.toFixed(2)}px, title ${g.minTitleEff?.toFixed(2)}px, name ${g.minNameEff?.toFixed(2)}px`);
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

test('phone 390x844 and desktop 1440x900 keep their own layout (no zoom)', { timeout: 180_000 }, async () => {
  for (const vp of [phoneContext, desktopContext]) {
    const page = await openFixture(contexts.get(vp.name), 'midweek', '', { requireReady: true });
    try {
      const g = await cardGeometry(page);
      assert.equal(g.hasWrapper, false, `${vp.name}: the card was wrapped for zoom`);
      assert.equal(g.zoom, 1, `${vp.name}: zoom ${g.zoom} was applied`);
      assert.equal(g.scale, null, `${vp.name}: a fit scale was recorded`);
      assert.ok(
        Math.abs(g.card.left - g.content.left) <= 1 && Math.abs(g.card.right - g.content.right) <= 1,
        `${vp.name}: card no longer spans the content area`,
      );
      assert.ok(g.card.bottom > g.innerHeight - TOOLBAR, `${vp.name}: the card was squeezed into the iPad fit`);
      assert.equal(
        g.railWidth,
        vp === desktopContext ? 236 : 0,
        `${vp.name}: unexpected sidebar width ${g.railWidth}`,
      );
    } finally {
      await page.close();
    }
  }
});

for (const vp of VIEWPORTS) {
  test(`${vp.name}: week bar switches weeks and the card still fits`, { timeout: 180_000 }, async () => {
    const page = await openFixture(contexts.get(vp.name), 'midweek', '', { requireReady: true });
    try {
      const bar = page.locator('[data-testid="week-bar"]');
      assert.ok(await bar.isVisible(), `${vp.name}: week bar is not visible`);
      const label = () => page.locator('[data-testid="week-label"]').innerText();
      const date = () => page.locator('.fit-to-screen .mw-head__date').first().innerText();
      const before = await label();
      const beforeDate = await date();
      await page.locator('[data-testid="week-next"]').click();
      await page.waitForFunction((old) => document.querySelector('[data-testid="week-label"]')?.textContent.trim() !== old, before);
      await page.waitForTimeout(350);
      assert.notEqual(await label(), before, `${vp.name}: next did not change the week`);
      assert.notEqual(await date(), beforeDate, `${vp.name}: next did not change the card date`);
      const g = await cardGeometry(page);
      const usable = g.innerHeight - TOOLBAR - g.chrome;
      assert.ok(g.card.bottom <= usable + 1 && g.card.bottom >= usable - 8, `${vp.name}: card bottom ${g.card.bottom} after next`);
      assert.ok(g.effectiveMinFont >= 11 && g.minTitleEff >= 14 && g.minNameEff >= 14, `${vp.name}: fonts after next`);

      await page.locator('[data-testid="week-prev"]').click();
      await page.waitForFunction((old) => document.querySelector('[data-testid="week-label"]')?.textContent.trim() === old, before);
      await page.waitForTimeout(350);
      assert.equal(await label(), before, `${vp.name}: prev did not restore the week`);
      assert.equal(await date(), beforeDate, `${vp.name}: prev did not restore the card date`);
      const back = await cardGeometry(page);
      assert.ok(back.card.bottom <= usable + 1 && back.card.bottom >= usable - 8, `${vp.name}: card bottom ${back.card.bottom} after prev`);
    } finally {
      await page.close();
    }
  });
}

test('1366x1024: the rail still fits the zoomed card with readable type', { timeout: 180_000 }, async (t) => {
  const page = await openFixture(contexts.get(wideContext.name), 'midweek', '', { requireReady: true });
  try {
    const g = await cardGeometry(page);
    const usable = g.innerHeight - TOOLBAR - g.chrome;
    assert.equal(g.railWidth, 68, 'wide iPad lost the icon rail');
    assert.ok(g.card.bottom <= usable + 1 && g.card.bottom >= usable - 8, `card bottom ${g.card.bottom}`);
    assert.ok(Math.abs(g.card.right - g.expectedRight) <= 1, `card right ${g.card.right}`);
    assert.ok(g.effectiveMinFont >= 11, `smallest effective font ${g.effectiveMinFont}`);
    assert.ok(g.minTitleEff >= 14 && g.minNameEff >= 14, `title/name ${g.minTitleEff}/${g.minNameEff}`);
    assert.ok(g.scrollWidth <= g.innerWidth + 1, 'horizontal overflow');
    t.diagnostic(`1366x1024: scale ${g.scale?.toFixed(4)}, effective smallest font ${g.effectiveMinFont?.toFixed(2)}px, title ${g.minTitleEff?.toFixed(2)}px, name ${g.minNameEff?.toFixed(2)}px`);
  } finally {
    await page.close();
  }
});

test('rail pages at 1280x900: 總覽 / 週末 / 服務 / 人員 / 書刊 / 匯出 / 設定', { timeout: 180_000 }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  try {
    for (const name of RAIL_PAGES) {
      const page = await ctx.newPage();
      try {
        await page.goto(`${baseUrl}/test-fixtures/chrome?page=${name}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1200);
        const m = await page.evaluate(() => ({
          innerWidth: window.innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          rail: document.querySelector('.sidenav')?.getBoundingClientRect().width ?? 0,
          nav: [...document.querySelectorAll('.navitem')].map((el) => ({
            label: el.getAttribute('aria-label'), title: el.title, current: el.getAttribute('aria-current'),
          })),
        }));
        assert.ok(m.scrollWidth <= m.innerWidth + 1, `${name}: scrollWidth ${m.scrollWidth} with the rail`);
        assert.equal(m.rail, 68, `${name}: rail is ${m.rail}px`);
        assert.ok(m.nav.length > 0 && m.nav.every((n) => n.label && n.title), `${name}: rail icons need aria-label and title`);
        // Every TabBar destination (and TopBar's page label) is reachable from
        // the rail at tablet widths; the 更多 overflow sheet is unnecessary
        // because all seven destinations fit as icons.
        assert.deepEqual(
          m.nav.map((n) => n.label),
          ['本週聚會', '總覽', '人員', '服務', '書刊', '匯入 / 匯出', '設定'],
          `${name}: rail is missing a TabBar destination`,
        );
        assert.ok(m.nav.some((n) => n.current === 'true'), `${name}: no active rail item marked`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await ctx.close();
  }
});
