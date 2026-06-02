import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPastHistory } from './pastHistory.mjs';

// today = 2026-06-02 (fixed for deterministic tests)
const TODAY = new Date(2026, 5, 2); // month is 0-indexed

const WEEK_PAST = { id: 1, date: '5月 20日', parts: [] };   // 2026-05-20 — past
const WEEK_FUTURE = { id: 2, date: '6月 10日', parts: [] }; // 2026-06-10 — future

test('past midweek chairman assignment counted and dated', () => {
  const assignments = { 'mw1_chairman': '張弟兄' };
  const hist = buildPastHistory([WEEK_PAST], assignments, [], TODAY);

  assert.ok(hist['張弟兄']);
  const entry = hist['張弟兄']['傳道與生活主席'];
  assert.ok(entry, 'entry for 傳道與生活主席 should exist');
  assert.equal(entry.halfYearCount, 1);
  assert.deepEqual(entry.lastDate, new Date(2026, 4, 20));
});

test('future midweek assignment is excluded', () => {
  const assignments = { 'mw2_chairman': '張弟兄' };
  const hist = buildPastHistory([WEEK_FUTURE], assignments, [], TODAY);
  assert.equal(hist['張弟兄'], undefined);
});

test('openPrayer and closePrayer both map to 禱告 tag', () => {
  const assignments = {
    'mw1_openPrayer': '李弟兄',
    'mw1_closePrayer': '李弟兄',
  };
  const hist = buildPastHistory([WEEK_PAST], assignments, [], TODAY);
  assert.equal(hist['李弟兄']['禱告'].halfYearCount, 2);
});

test('halfYearCount excludes assignments older than 180 days', () => {
  const oldWeek = { id: 3, date: '11月 20日', parts: [] }; // 2025-11-20 — >180 days ago
  const assignments = {
    'mw1_chairman': '張弟兄',  // 2026-05-20 — within 180
    'mw3_chairman': '張弟兄',  // 2025-11-20 — outside 180
  };
  const hist = buildPastHistory([WEEK_PAST, oldWeek], assignments, [], TODAY);
  assert.equal(hist['張弟兄']['傳道與生活主席'].halfYearCount, 1);
  // lastDate should still be updated (it's the most recent, but still older one is recorded)
  assert.deepEqual(hist['張弟兄']['傳道與生活主席'].lastDate, new Date(2026, 4, 20));
});

test('lastDate is always the most recent past assignment', () => {
  const weekEarlier = { id: 4, date: '4月 5日', parts: [] }; // 2026-04-05
  const assignments = {
    'mw1_chairman': '張弟兄',  // 2026-05-20
    'mw4_chairman': '張弟兄',  // 2026-04-05
  };
  const hist = buildPastHistory([WEEK_PAST, weekEarlier], assignments, [], TODAY);
  assert.deepEqual(hist['張弟兄']['傳道與生活主席'].lastDate, new Date(2026, 4, 20));
});

test('past weekend speaker assignment counted', () => {
  const rows = [{ date: '5/10', speaker: '王弟兄', chair: '', wt: '', read: '' }];
  const hist = buildPastHistory([], {}, rows, TODAY);
  assert.equal(hist['王弟兄']['公眾演講'].halfYearCount, 1);
  assert.deepEqual(hist['王弟兄']['公眾演講'].lastDate, new Date(2026, 4, 10));
});

test('future weekend row is excluded', () => {
  const rows = [{ date: '6/15', speaker: '王弟兄', chair: '', wt: '', read: '' }];
  const hist = buildPastHistory([], {}, rows, TODAY);
  assert.equal(hist['王弟兄'], undefined);
});

test('empty name fields are skipped', () => {
  const rows = [{ date: '5/10', speaker: '', chair: null, wt: undefined, read: '陳姊妹' }];
  const hist = buildPastHistory([], {}, rows, TODAY);
  assert.equal(Object.keys(hist).length, 1);
  assert.ok(hist['陳姊妹']);
});

test('midweek part assignment uses part cat tag', () => {
  const week = {
    id: 5,
    date: '5月 20日',
    parts: [{ id: 10, cat: 'treasures' }],
  };
  const assignments = { 'mw5_10_0': '陳弟兄' };
  const hist = buildPastHistory([week], assignments, [], TODAY);
  assert.equal(hist['陳弟兄']['寶藏演講'].halfYearCount, 1);
});

test('returns empty object when no data', () => {
  const hist = buildPastHistory([], {}, [], TODAY);
  assert.deepEqual(hist, {});
});
