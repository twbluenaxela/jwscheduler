import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPastHistory, slotRefDate } from './pastHistory.mjs';

// Scenario: today = 6/2, assigning for 7/1 slot (refDate = 7/1)
const REF = new Date(2026, 6, 1);   // 2026-07-01 — the slot being assigned
const TODAY = new Date(2026, 5, 2); // 2026-06-02 — actual today (unused by buildPastHistory)

const WEEK_JUNE3  = { id: 1, date: '6月 3日', parts: [] };  // 2026-06-03 — before 7/1 ✓
const WEEK_JULY1  = { id: 2, date: '7月 1日', parts: [] };  // 2026-07-01 — same as ref ✓
const WEEK_JULY8  = { id: 3, date: '7月 8日', parts: [] };  // 2026-07-08 — after ref ✗

test('6/3 assignment counts when assigning for 7/1 (ref date = 7/1)', () => {
  const assignments = { 'mw1_chairman': '于樂洋' };
  const hist = buildPastHistory([WEEK_JUNE3], assignments, [], REF);
  assert.ok(hist['于樂洋'], '6/3 is before 7/1 and should be counted');
  assert.equal(hist['于樂洋']['傳道與生活主席'].halfYearCount, 1);
});

test('daysSince is measured from refDate, never negative (6/3 → 7/1 = 28 days)', () => {
  const assignments = { 'mw1_chairman': '于樂洋' };
  const hist = buildPastHistory([WEEK_JUNE3], assignments, [], REF);
  assert.equal(hist['于樂洋']['傳道與生活主席'].daysSince, 28);
});

test('an earlier prayer assignment still counts when assigning a later slot', () => {
  // 林俊吉 did 禱告 on 6/3; assigning a 6/24-ish slot (ref 7/1) → counts, daysSince = 28.
  const assignments = { 'mw1_openPrayer': '林俊吉' };
  const hist = buildPastHistory([WEEK_JUNE3], assignments, [], REF);
  assert.equal(hist['林俊吉']['禱告'].daysSince, 28);
});

test('same-date assignment is excluded (the meeting being planned, not history)', () => {
  // Regression: a 禱告 person already in the 6/24 slot must NOT show "0 天前剛擔任"
  // when you open that same 6/24 禱告 slot.
  const assignments = { 'mw2_chairman': '于樂洋' };
  const hist = buildPastHistory([WEEK_JULY1], assignments, [], REF);
  assert.equal(hist['于樂洋'], undefined, 'assignment on the slot date must not count');
});

test('assignment after ref date is excluded', () => {
  const assignments = { 'mw3_chairman': '于樂洋' };
  const hist = buildPastHistory([WEEK_JULY8], assignments, [], REF);
  assert.equal(hist['于樂洋'], undefined);
});

test('openPrayer and closePrayer both map to 禱告 tag', () => {
  const assignments = {
    'mw1_openPrayer': '林俊吉',
    'mw1_closePrayer': '林俊吉',
  };
  const hist = buildPastHistory([WEEK_JUNE3], assignments, [], REF);
  assert.equal(hist['林俊吉']['禱告'].halfYearCount, 2);
});

test('halfYearCount window is 180 days before refDate', () => {
  const oldWeek = { id: 4, date: '12月 20日', parts: [] }; // 2025-12-20 — >180 days before 7/1/2026
  const assignments = {
    'mw1_chairman': '于樂洋',  // 2026-06-03 — within 180 days of 7/1 ✓
    'mw4_chairman': '于樂洋',  // 2025-12-20 — outside 180 days of 7/1 ✗
  };
  const hist = buildPastHistory([WEEK_JUNE3, oldWeek], assignments, [], REF);
  assert.equal(hist['于樂洋']['傳道與生活主席'].halfYearCount, 1);
  assert.deepEqual(hist['于樂洋']['傳道與生活主席'].lastDate, new Date(2026, 5, 3));
});

test('lastDate is always the most recent assignment before refDate', () => {
  const weekMay = { id: 5, date: '5月 6日', parts: [] }; // 2026-05-06
  const assignments = {
    'mw1_chairman': '于樂洋',  // 2026-06-03
    'mw5_chairman': '于樂洋',  // 2026-05-06
  };
  const hist = buildPastHistory([WEEK_JUNE3, weekMay], assignments, [], REF);
  assert.deepEqual(hist['于樂洋']['傳道與生活主席'].lastDate, new Date(2026, 5, 3));
});

test('past weekend speaker assignment counted', () => {
  const rows = [{ _id: 1, date: '5/10', speaker: '王弟兄', chair: '', wt: '', read: '' }];
  const hist = buildPastHistory([], {}, rows, REF);
  assert.equal(hist['王弟兄']['公眾演講'].halfYearCount, 1);
  assert.deepEqual(hist['王弟兄']['公眾演講'].lastDate, new Date(2026, 4, 10));
});

test('future weekend row (after refDate) is excluded', () => {
  const rows = [{ _id: 2, date: '8/1', speaker: '王弟兄', chair: '', wt: '', read: '' }];
  const hist = buildPastHistory([], {}, rows, REF);
  assert.equal(hist['王弟兄'], undefined);
});

test('empty name fields are skipped', () => {
  const rows = [{ _id: 3, date: '5/10', speaker: '', chair: null, wt: undefined, read: '陳姊妹' }];
  const hist = buildPastHistory([], {}, rows, REF);
  assert.equal(Object.keys(hist).length, 1);
  assert.ok(hist['陳姊妹']);
});

test('midweek part assignment uses part cat tag (flat parts array)', () => {
  const week = { id: 6, date: '6月 3日', parts: [{ id: 't0', cat: 'treasures' }] };
  const assignments = { 'mw6_t0_0': '楊家松' };
  const hist = buildPastHistory([week], assignments, [], REF);
  assert.equal(hist['楊家松']['寶藏演講'].halfYearCount, 1);
});

test('midweek part assignment resolves parts from section arrays (DB-mapped shape)', () => {
  // This mirrors mapWeek() output: no flat `parts`, parts live under section arrays.
  const week = {
    id: 7,
    date: '6月 3日',
    treasures: [{ id: 't0', cat: 'treasures' }, { id: 'g0', cat: 'gems' }],
    ministry:  [{ id: 'm0', cat: 'ministry' }],
    living:    [{ id: 'cbs', cat: 'cbs' }],
  };
  const assignments = {
    'mw7_t0_0': '于樂洋',   // 寶藏演講
    'mw7_g0_0': '楊家松',   // 經文寶石
    'mw7_m0_0': '陳弟兄',   // 傳道示範
  };
  const hist = buildPastHistory([week], assignments, [], REF);
  assert.equal(hist['于樂洋']['寶藏演講'].halfYearCount, 1, '寶藏演講 should be recorded');
  assert.equal(hist['楊家松']['經文寶石'].halfYearCount, 1);
  assert.equal(hist['陳弟兄']['傳道示範'].halfYearCount, 1);
});

test('returns empty object when no data', () => {
  const hist = buildPastHistory([], {}, [], REF);
  assert.deepEqual(hist, {});
});

// slotRefDate tests
test('slotRefDate returns the meeting date for a midweek slot', () => {
  const weeks = [{ id: 7, date: '7月 1日', parts: [] }];
  const d = slotRefDate('mw7_chairman', weeks, []);
  assert.deepEqual(d, new Date(new Date().getFullYear() === 2026 ? 2026 : new Date().getFullYear(), 6, 1));
});

test('slotRefDate falls back to today (midnight) for unknown slot', () => {
  const d = slotRefDate('mw999_chairman', [], []);
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  assert.equal(d.toDateString(), todayMidnight.toDateString());
});
