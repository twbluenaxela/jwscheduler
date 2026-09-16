import test from 'node:test';
import assert from 'node:assert/strict';

import {
  A4_PRINTABLE_PT,
  MIN_ROW_SCALE,
  PAGE_BUDGET_PT,
  ROW_HT,
  buildSheetPlan,
  paginateWeeks,
  partRowHeight,
  partTitleText,
  rowScaleFor,
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
  assert.equal(titleLineCount('屬靈寶石（10 分鐘）'), 1);
  // 44 units is the column width; a CJK glyph is two units, so ~22 chars a line.
  assert.equal(titleLineCount('十'.repeat(22)), 1);
  assert.equal(titleLineCount('十'.repeat(23)), 2);
  assert.equal(titleLineCount('十'.repeat(45)), 3);
});

test('a three-line title reserves three lines, not two', () => {
  // The old rule was binary (>44 units → 30pt), so this row was both clipped on
  // the page and under-counted in the page budget. That under-count is exactly
  // how a spread could overflow with nothing noticing.
  const long = part('會眾研經班', {
    dur: '30 分鐘',
    cbsRef: '《組織》第 12 章 第 1-9 段，以及附欄「怎樣善用這本書研讀聖經」和複習問題',
  });
  assert.equal(titleLineCount(partTitleText(long)), 3);
  assert.ok(partRowHeight(long) > 30, `expected >30pt, got ${partRowHeight(long)}`);

  // Even a merely two-line title was under-counted by the old flat 30pt.
  const twoLine = part('會眾研經班', { dur: '30 分鐘', cbsRef: '《組織》第 12 章 第 1-9 段' });
  assert.equal(titleLineCount(partTitleText(twoLine)), 2);
  assert.ok(partRowHeight(twoLine) > 30);
});

test('a short part row stays compact', () => {
  assert.equal(partRowHeight(part('屬靈寶石')), ROW_HT.part);
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

test('September-shaped weeks are left uncompressed', () => {
  const plan = buildSheetPlan([1, 2, 3, 4].map(septemberWeek), null, opts);
  assert.equal(plan.rowScale, 1, 'a month that printed fine must not start shrinking');
});

test('October-shaped weeks overflow a page and are compressed', () => {
  const pair = heightOf(octoberWeek(1)) * 2 + ROW_HT.spacer;
  assert.ok(
    pair > A4_PRINTABLE_PT,
    `the fixture must actually overflow, else this test proves nothing (got ${pair.toFixed(1)}pt vs ${A4_PRINTABLE_PT.toFixed(1)}pt)`,
  );
  const plan = buildSheetPlan([1, 2, 3, 4, 5].map(octoberWeek), null, opts);
  assert.ok(plan.rowScale < 1, 'expected a squeeze');
  assert.ok(plan.rowScale >= MIN_ROW_SCALE);
  // Two weeks per page survives the squeeze — that is the whole point.
  assert.deepEqual(plan.pages.map((p) => p.scheduled), [2, 2, 1]);
});

// NOTE ON WHAT THIS PROVES: the budget is derived from the same height model the
// rows are built with, so this test pins the PACKER, not the model. Whether our
// row heights match what a spreadsheet actually prints can only be checked by a
// real renderer — that is what scripts/check-xlsx-pagination.mjs is for.
test('EVERY page fits its budget, across a matrix of month shapes', () => {
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
      plan.pageHeights.forEach((height, i) => {
        assert.ok(
          height <= PAGE_BUDGET_PT + 0.01,
          `${name} × ${count}: page ${i + 1} is ${height.toFixed(1)}pt but the budget is ${PAGE_BUDGET_PT.toFixed(1)}pt`,
        );
      });
    }
  }
});

test('page count is ceil(scheduled weeks / 2)', () => {
  for (let count = 1; count <= 9; count += 1) {
    const weeks = Array.from({ length: count }, (_, i) => octoberWeek(i + 1));
    const plan = buildSheetPlan(weeks, null, opts);
    assert.equal(plan.pages.length, Math.ceil(count / 2), `${count} weeks`);
    assert.equal(plan.breaks.length, plan.pages.length - 1);
  }
});

test('breaks land exactly on a week header row', () => {
  // An off-by-one here is the difference between a clean spread and half a week
  // stranded on the next page.
  const plan = buildSheetPlan([1, 2, 3, 4, 5, 6].map(octoberWeek), null, opts);
  for (const index of plan.breaks) {
    const expected = Math.round(ROW_HT.head * plan.rowScale * 100) / 100;
    assert.equal(plan.rows[index].ht, expected, `row ${index} should start a week`);
    assert.ok(plan.rows[index].cells[0].rich, 'a week header carries rich text');
  }
});

test('the EMITTED rows between breaks also fit the budget', () => {
  // pageHeights is computed; this walks what actually lands in the sheet, so a
  // bug in the emit loop (a spacer on the wrong side of a break, say) shows up.
  const plan = buildSheetPlan([1, 2, 3, 4, 5, 6].map(octoberWeek), null, opts);
  const bounds = [...plan.breaks, plan.rows.length];
  let start = 0;
  bounds.forEach((end, i) => {
    const height = sumHeights(plan.rows.slice(start, end));
    assert.ok(height <= PAGE_BUDGET_PT + 0.01, `page ${i + 1} overflows: ${height} > ${PAGE_BUDGET_PT}`);
    start = end;
  });
});

/* ===================== the primitives ===================== */

test('rowScaleFor leaves a fitting workbook alone', () => {
  assert.equal(rowScaleFor([100, 200]), 1);
  assert.equal(rowScaleFor([]), 1);
  assert.equal(rowScaleFor([PAGE_BUDGET_PT]), 1);
});

test('rowScaleFor squeezes just enough to fit the tallest page', () => {
  const tall = PAGE_BUDGET_PT * 1.1;
  const scale = rowScaleFor([tall, 100]);
  assert.ok(scale < 1);
  assert.ok(tall * scale <= PAGE_BUDGET_PT + 0.01);
});

test('rowScaleFor never squeezes past the legibility floor', () => {
  assert.equal(rowScaleFor([PAGE_BUDGET_PT * 10]), MIN_ROW_SCALE);
});

test('TWO MEANS TWO — even an absurdly tall pair shares one page', () => {
  // The answer to a pair that will not fit is to squeeze the rows further, not
  // to reprint the month at one week a sheet.
  const monster = () => ({
    ...septemberWeek(1),
    ministry: Array.from({ length: 30 }, (_, i) => part(`很長的傳道訓練項目 ${i}`)),
  });
  const weeks = [monster(), monster()];
  assert.ok(heightOf(weeks[0]) * 2 > PAGE_BUDGET_PT, 'fixture must actually overflow');
  const plan = buildSheetPlan(weeks, null, opts);
  assert.equal(plan.pages.length, 1);
  assert.deepEqual(plan.pages.map((p) => p.scheduled), [2]);
  assert.ok(plan.rowScale < 1);
});

test('page count is always ceil(scheduled / 2), however tall the weeks are', () => {
  const tall = (id) => ({
    ...octoberWeek(id),
    ministry: Array.from({ length: 12 }, (_, i) => part(`很長的傳道訓練項目名稱 ${i}`)),
  });
  for (let count = 1; count <= 6; count += 1) {
    const plan = buildSheetPlan(Array.from({ length: count }, (_, i) => tall(i + 1)), null, opts);
    assert.equal(plan.pages.length, Math.ceil(count / 2), `${count} very tall weeks`);
  }
});
