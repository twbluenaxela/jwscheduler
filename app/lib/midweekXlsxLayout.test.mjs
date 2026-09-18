import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

import {
  A4_PRINTABLE_PT,
  MAX_ROW_PT,
  PRINT_TARGET_PT,
  MIN_ROW_FOR,
  ROW_HT,
  TITLE_COL_UNITS,
  buildMidweekXlsxBlob,
  buildSheetPlan,
  buildWorksheetSpread,
  padRows,
  pageHeightFor,
  sheetScale,
  paginateWeeks,
  partRowHeight,
  partTitleText,
  sumHeights,
  titleLineCount,
  weekRows,
} from './midweekXlsxLayout.mjs';
import { isMidweekSuspended } from './weekType.mjs';

/* ===================== fixtures ===================== */

let nextId = 1;
const part = (title, extra = {}) => ({
  id: `p${nextId += 1}`, time: '7:36', partNum: 1, title, dur: '5 分鐘', cat: 'x', assign: [], ...extra,
});

// A week shaped like September's: 3 / 3 / 3 parts, all short titles. These
// printed correctly before this change and must keep printing at 100% scale.
function septemberWeek(id) {
  return {
    id,
    date: `9月 ${id}日`,
    weekdayPill: '星期三 · 19:30',
    reading: '耶利米書 1-3 章',
    openSong: '84', midSong: '76', closeSong: '18',
    closingDur: '不超過 3 分鐘',
    treasures: [part('不要怕他們'), part('屬靈寶石'), part('經文朗讀', { roleLabel: '學生' })],
    ministry: [
      part('初次交談', { roleLabel: '學生/助手' }),
      part('再次交談', { roleLabel: '學生/助手' }),
      part('教導人成為門徒', { roleLabel: '學生/助手' }),
    ],
    living: [part('像耶利米一樣勇敢'), part('會眾研經班', { roleLabel: '主持/朗讀' })],
  };
}

// The shape that broke: more 用心準備傳道工作 parts AND long wrapping titles.
function octoberWeek(id) {
  return {
    ...septemberWeek(id),
    date: `10月 ${id}日`,
    ministry: [
      part('初次交談 — 向住戶作見證，並且說明聖經怎樣回答這個問題', { roleLabel: '學生/助手' }),
      part('再次交談 — 回覆住戶上次提出的疑問', { roleLabel: '學生/助手' }),
      part('教導人成為門徒 — 運用《樂享永恆的生命》課文', { roleLabel: '學生/助手' }),
      part('解釋自己的信仰 — 演講', { roleLabel: '學生' }),
      part('你會怎麼說？'),
    ],
    living: [
      part('怎樣在傳道工作上保持喜樂，即使遇到冷漠的反應'),
      part('會眾研經班', { roleLabel: '主持/朗讀', cbsRef: '《組織》第 12 章 第 1-9 段，附欄「怎樣善用這本書」' }),
    ],
  };
}

const suspendedWeek = (id, label = '國際大會') => ({
  ...septemberWeek(id), type: 'suspended', label,
});

const opts = { isSuspended: isMidweekSuspended };
const heightOf = (week) => sumHeights(weekRows(week, null, opts));

/* ===================== the height model ===================== */

test('titleLineCount grows past two lines', () => {
  // TITLE_COL_UNITS is the 項目 column's width; a CJK glyph is two units, so a
  // line holds half that many characters.
  const perLine = Math.floor(TITLE_COL_UNITS / 2);
  assert.equal(titleLineCount('十'.repeat(perLine)), 1);
  assert.equal(titleLineCount('十'.repeat(perLine + 1)), 2);
  assert.equal(titleLineCount('十'.repeat(perLine * 2 + 1)), 3);
});

test('a three-line title reserves three lines, not two', () => {
  // The old rule was binary (>44 units → 30pt), so this row was both clipped on
  // the page and under-counted in the page budget. That under-count is exactly
  // how a spread could overflow with nothing noticing.
  const long = part('會眾研經班', {
    dur: '30 分鐘',
    cbsRef: '《組織》第 12 章 第 1-9 段，以及附欄「怎樣善用這本書研讀聖經」和複習問題',
  });
  // At least three — the reservation is deliberately conservative (see
  // TITLE_COL_UNITS), so pinning an exact count would only pin the safety margin.
  assert.ok(titleLineCount(partTitleText(long)) >= 3);
  assert.ok(partRowHeight(long) > 30, `expected >30pt, got ${partRowHeight(long)}`);

  // Even a merely two-line title was under-counted by the old flat 30pt.
  const twoLine = part('會眾研經班', { dur: '30 分鐘', cbsRef: '《組織》第 12 章 第 1-9 段' });
  assert.ok(titleLineCount(partTitleText(twoLine)) >= 2);
  assert.ok(partRowHeight(twoLine) > 30);
});

test('a short part row stays compact', () => {
  assert.equal(partRowHeight(part('屬靈寶石')), ROW_HT.part);
});

/* ===================== row heights clear their font ===================== */

// A guard, not a theory. fit-to-height absorbs UNIFORM row growth (the whole
// sheet scales), so a row being a little taller everywhere costs nothing. This
// only pins that no fixed row is asked to hold text taller than itself, which a
// future font-size bump could otherwise do silently.
test('every fixed-height row clears the line box of the font it carries', () => {
  assert.ok(ROW_HT.item >= MIN_ROW_FOR(11));
  assert.ok(ROW_HT.part >= MIN_ROW_FOR(11));
  assert.ok(ROW_HT.notice >= MIN_ROW_FOR(11));
  assert.ok(ROW_HT.band >= MIN_ROW_FOR(12));
  assert.ok(ROW_HT.head >= MIN_ROW_FOR(14));
});

/* ===================== packing ===================== */

test('two scheduled weeks per page', () => {
  const weeks = [1, 2, 3, 4, 5].map(septemberWeek);
  const pages = paginateWeeks(weeks, opts);
  assert.deepEqual(pages.map((p) => p.indexes), [[0, 1], [2, 3], [4]]);
});

test('a cancelled week rides along without consuming a slot', () => {
  // The whole point: without this, one 大會 week knocks every following spread
  // out of phase and the rest of the month prints one week per page.
  const weeks = [septemberWeek(1), suspendedWeek(2), septemberWeek(3), septemberWeek(4)];
  const pages = paginateWeeks(weeks, opts);
  assert.deepEqual(pages.map((p) => p.indexes), [[0, 1, 2], [3]]);
  assert.deepEqual(pages.map((p) => p.scheduled), [2, 1]);
});

test('a cancelled week collapses to two rows and prints no names', () => {
  const week = { ...suspendedWeek(9), chairman: '王文哲', openPrayer: '林家明' };
  const rows = weekRows(week, () => '不該出現', opts);
  assert.equal(rows.length, 2);
  const text = JSON.stringify(rows);
  assert.ok(text.includes('本週聚會暫停 — 國際大會'));
  assert.ok(!text.includes('不該出現'));
  assert.ok(!text.includes('王文哲'));
});

test('empty input produces no pages', () => {
  assert.deepEqual(paginateWeeks([], opts), []);
  assert.deepEqual(paginateWeeks(undefined, opts), []);
});

/* ===================== the regression this change exists for ===================== */

// Measures the emitted sheet the way a renderer does: the rows between two
// manual breaks are one page.
function emittedPages(plan) {
  const bounds = [...plan.breaks, plan.rows.length];
  const out = [];
  let start = 0;
  for (const end of bounds) { out.push(plan.rows.slice(start, end)); start = end; }
  return out;
}

test('EVERY page ends up exactly the same height', () => {
  // This is the whole mechanism. Equal pages + fitToHeight=pageCount means the
  // renderer picks scale = itsUsableHeight / pageHeight, so one page holds
  // exactly one spread — whatever margins it actually applies. Unequal pages
  // break that: the scale comes out wrong and weeks split.
  const shapes = {
    september: septemberWeek,
    october: octoberWeek,
    mixed: (id) => (id % 2 ? septemberWeek(id) : octoberWeek(id)),
    withSuspended: (id) => (id === 3 ? suspendedWeek(id) : octoberWeek(id)),
  };
  for (const [name, make] of Object.entries(shapes)) {
    for (let count = 1; count <= 7; count += 1) {
      const weeks = Array.from({ length: count }, (_, i) => make(i + 1));
      const plan = buildSheetPlan(weeks, null, opts);
      const heights = emittedPages(plan).map(sumHeights);
      assert.ok(
        Math.max(...heights) - Math.min(...heights) < 0.02,
        `${name} × ${count}: pages differ — ${heights.map((h) => h.toFixed(2)).join(', ')}`,
      );
      assert.ok(
        Math.abs(heights[0] - plan.pageHeight) < 0.02,
        `${name} × ${count}: page is ${heights[0]} but pageHeight is ${plan.pageHeight}`,
      );
    }
  }
});

test('the LAST page is padded too, and its filler is anchored by a cell', () => {
  // Trailing blank rows are not part of a sheet's used range. Unanchored, the
  // last page's padding is discarded, the sheet comes out shorter than
  // pageCount × pageHeight, and the fit-to-height scale is too large — which
  // split a week at every margin setting when rendered.
  const plan = buildSheetPlan([1, 2, 3, 4, 5].map(octoberWeek), null, opts);
  const pages = emittedPages(plan);
  const last = pages[pages.length - 1];
  assert.ok(Math.abs(sumHeights(last) - plan.pageHeight) < 0.02, 'last page not padded');
  const finalRow = plan.rows[plan.rows.length - 1];
  assert.ok(finalRow.cells.length > 0, 'the sheet must not end on a cell-less filler row');
});

test('every filler row carries a cell, not just the last one', () => {
  // A blank row is outside the sheet's used range, so a reader is free to drop
  // it — taking the padding, and with it the equal pages, away. Only the
  // deliberate inter-week spacer may be empty.
  const plan = buildSheetPlan([1, 2, 3, 4, 5].map(octoberWeek), null, opts);
  const empties = plan.rows.filter((r) => r.cells.length === 0);
  assert.ok(
    empties.every((r) => r.ht === ROW_HT.spacer),
    `${empties.length} cell-less row(s) that are not the week spacer`,
  );
});

test('a spread is scaled to fit the MEASURED usable height, never the requested one', () => {
  // 690pt is not a guess. The failing print preview (Excel for Android, ISO A4)
  // measures 0.83in top and 0.97in bottom margins — its own defaults, not the
  // 0.35in the file asks for — leaving 712.4pt usable, against a 752pt October
  // spread. That 40pt was the row that kept falling onto the next page.
  assert.ok(PRINT_TARGET_PT <= 712, 'target must fit the measured usable height');

  const tall = (id) => ({
    ...octoberWeek(id),
    ministry: Array.from({ length: 12 }, (_, i) => part(`很長的傳道訓練項目名稱 ${i}`)),
  });
  for (const make of [septemberWeek, octoberWeek, tall]) {
    for (let count = 1; count <= 7; count += 1) {
      const plan = buildSheetPlan(Array.from({ length: count }, (_, i) => make(i + 1)), null, opts);
      const printed = (pt) => (pt * plan.scale) / 100;
      assert.ok(plan.scale <= 100, 'never blow the sheet up past 100%');
      assert.ok(plan.scale >= 10, `scale collapsed to ${plan.scale}%`);
      // Every page, padding included, renders to exactly the target height.
      assert.ok(Math.abs(printed(plan.pageHeight) - PRINT_TARGET_PT) < 1);
      // And no spread's CONTENT can exceed it.
      for (const raw of plan.rawHeights) {
        assert.ok(
          printed(raw) <= PRINT_TARGET_PT + 0.5,
          `a spread prints at ${printed(raw).toFixed(1)}pt, past the ${PRINT_TARGET_PT}pt page`,
        );
      }
    }
  }
});

test('a short month prints at 100%, a tall one is scaled down', () => {
  const short = buildSheetPlan([1, 2].map(septemberWeek), null, opts);
  assert.equal(short.scale, 100, 'a month that already fits must not be shrunk');

  const tall = (id) => ({
    ...octoberWeek(id),
    ministry: Array.from({ length: 12 }, (_, i) => part(`很長的傳道訓練項目名稱 ${i}`)),
  });
  const plan = buildSheetPlan([1, 2].map(tall), null, opts);
  assert.ok(plan.scale < 100, 'a spread taller than the page must be scaled down');
  assert.equal(plan.scale, sheetScale(Math.max(...plan.rawHeights)));
});

test('page count is always ceil(scheduled / 2), however tall the weeks are', () => {
  const tall = (id) => ({
    ...octoberWeek(id),
    ministry: Array.from({ length: 12 }, (_, i) => part(`很長的傳道訓練項目名稱 ${i}`)),
  });
  for (let count = 1; count <= 9; count += 1) {
    for (const make of [septemberWeek, octoberWeek, tall]) {
      const plan = buildSheetPlan(Array.from({ length: count }, (_, i) => make(i + 1)), null, opts);
      assert.equal(plan.pageCount, Math.ceil(count / 2), `${count} weeks`);
      assert.equal(plan.breaks.length, plan.pageCount - 1);
      assert.equal(emittedPages(plan).length, plan.pageCount);
    }
  }
});

test('TWO MEANS TWO — even an absurdly tall pair shares one page', () => {
  const monster = () => ({
    ...septemberWeek(1),
    ministry: Array.from({ length: 30 }, (_, i) => part(`很長的傳道訓練項目 ${i}`)),
  });
  const plan = buildSheetPlan([monster(), monster()], null, opts);
  assert.equal(plan.pageCount, 1);
  assert.deepEqual(plan.pages.map((p) => p.scheduled), [2]);
});

test('breaks land exactly on a week header row', () => {
  // An off-by-one here is the difference between a clean spread and half a week
  // stranded on the next page.
  const plan = buildSheetPlan([1, 2, 3, 4, 5, 6].map(octoberWeek), null, opts);
  for (const index of plan.breaks) {
    assert.equal(plan.rows[index].ht, ROW_HT.head, `row ${index} should start a week`);
    assert.ok(plan.rows[index].cells[0].rich, 'a week header carries rich text');
  }
});

/* ===================== padding ===================== */

test('padRows fills exactly to the target and anchors only its final row', () => {
  for (const [from, target] of [[0, 800], [100, 800], [700, 791.5], [791.49, 791.5]]) {
    const pad = padRows(from, target);
    const total = from + pad.reduce((t, r) => t + r.ht, 0);
    assert.ok(Math.abs(total - target) < 0.02, `${from}→${target} landed at ${total}`);
    assert.ok(pad.every((r) => r.ht <= MAX_ROW_PT), 'a filler row exceeds Excel\'s row cap');
    assert.equal(pad.filter((r) => r.anchor).length, 1, 'exactly one anchored filler');
    assert.ok(pad[pad.length - 1].anchor, 'the anchor must be the last filler');
  }
});

test('padRows adds nothing when the page is already at the target', () => {
  assert.deepEqual(padRows(800, 800), []);
  assert.deepEqual(padRows(850, 800), []);
});

test('pageHeightFor is whatever renders to one target page at the chosen scale', () => {
  for (const heights of [[100, 200], [], [900, 400], [752, 700]]) {
    const h = pageHeightFor(heights);
    const printed = (h * sheetScale(Math.max(...heights, 0))) / 100;
    assert.ok(Math.abs(printed - PRINT_TARGET_PT) < 1, `${heights} -> printed ${printed}`);
  }
  // A sheet that already fits is left at 100%, so the page is the target itself.
  assert.equal(pageHeightFor([100, 200]), PRINT_TARGET_PT);
});

test('downloaded workbook makes each two-week spread an independent one-page sheet', async () => {
  const weeks = [1, 2, 3, 4, 5].map(octoberWeek);
  const blob = await buildMidweekXlsxBlob(weeks, null);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const workbook = await zip.file('xl/workbook.xml').async('string');
  const sheetNames = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);

  assert.equal(sheetNames.length, 3);
  assert.match(sheetNames[0], /10月 1日-10月 2日/);
  assert.match(sheetNames[2], /10月 5日/);

  const sheets = await Promise.all([1, 2, 3].map((n) => (
    zip.file(`xl/worksheets/sheet${n}.xml`).async('string')
  )));
  sheets.forEach((xml) => {
    assert.match(xml, /<pageSetUpPr fitToPage="1"\/>/);
    assert.match(xml, /<pageSetup[^>]*paperSize="9"[^>]*scale="\d+"[^>]*fitToWidth="1" fitToHeight="1"\/>/);
    assert.doesNotMatch(xml, /<rowBreaks/);
    assert.doesNotMatch(
      xml,
      /<t xml:space="preserve"> <\/t>/,
      'a per-page worksheet must not contain synthetic space-filled padding rows',
    );
  });

  assert.match(sheets[0], /10月 1日/);
  assert.match(sheets[0], /10月 2日/);
  assert.doesNotMatch(sheets[0], /10月 3日/);
  assert.match(sheets[1], /10月 3日/);
  assert.match(sheets[1], /10月 4日/);
  assert.match(sheets[2], /10月 5日/);
});

test('one-page worksheet spread ends on the final real meeting row', () => {
  const weeks = [octoberWeek(1), octoberWeek(2)];
  const spread = buildWorksheetSpread(weeks, null, opts);
  const expectedRows = weekRows(weeks[0], null, opts).length
    + 1
    + weekRows(weeks[1], null, opts).length;

  assert.equal(spread.rows.length, expectedRows, 'only real rows plus the inter-week spacer');
  assert.equal(spread.rows.filter((row) => row.cells?.[0]?.v === ' ').length, 0);
  assert.equal(spread.rows.at(-1).cells[2].v, `唱詩 ${weeks[1].closeSong} 首`);
  assert.equal(spread.contentHeight, sumHeights(spread.rows));
  assert.equal(spread.scale, sheetScale(spread.contentHeight));
});

test('cancelled weeks stay with their two scheduled weeks on the same worksheet', async () => {
  const weeks = [octoberWeek(1), suspendedWeek(2), octoberWeek(3), octoberWeek(4)];
  const blob = await buildMidweekXlsxBlob(weeks, null);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const first = await zip.file('xl/worksheets/sheet1.xml').async('string');
  const second = await zip.file('xl/worksheets/sheet2.xml').async('string');

  assert.match(first, /10月 1日/);
  assert.match(first, /9月 2日/);
  assert.match(first, /10月 3日/);
  assert.match(second, /10月 4日/);
});
