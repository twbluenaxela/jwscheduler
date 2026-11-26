import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSuggestPastHistory } from './suggestHistory.mjs';

const X = `x_${'a'.repeat(32)}`;

function week(id, date, parts, assignments) {
  return { id, date, isoDate: date, parts, assignments };
}

function part(partKey, extra = {}) {
  return { partKey, cat: 'living', roleLabel: null, title: '本地需要', ...extra };
}

function asg(slotId, name) {
  return { slotId, name };
}

test('suggest history keeps assignments to parts added in 基督徒的生活', () => {
  const weeks = [week(37, '2026-09-10',
    [part(X), part('l0')],
    [asg(`mw37_${X}_0`, '甲'), asg('mw37_l0_0', '乙')])];
  const rows = buildSuggestPastHistory(weeks);
  assert.deepEqual(rows.map((r) => [r.name, r.cat]), [['甲', 'living'], ['乙', 'living']]);
});

test('suggest history ignores an assignment whose week prefix disagrees with its row', () => {
  // A stale/misfiled row must not attribute someone else's turn to this week.
  const weeks = [week(37, '2026-09-10', [part('l0')], [asg('mw36_l0_0', '甲')])];
  assert.deepEqual(buildSuggestPastHistory(weeks), []);
});

test('suggest history still maps the fixed slots to their cats', () => {
  const weeks = [week(5, '2026-09-17', [], [
    asg('mw5_chairman', '甲'), asg('mw5_openPrayer', '乙'), asg('mw5_closePrayer', '丙'),
  ])];
  assert.deepEqual(buildSuggestPastHistory(weeks).map((r) => r.cat), ['chairman', 'prayer', 'prayer']);
});

test('suggest history gives the CBS reader its own cat and a pairId to the conductor', () => {
  const cbs = { partKey: 'm9', cat: 'cbs', roleLabel: '主持/朗讀', title: '會眾研經班' };
  const weeks = [week(8, '2026-09-24', [cbs], [asg('mw8_m9_0', '甲'), asg('mw8_m9_1', '乙')])];
  const rows = buildSuggestPastHistory(weeks);
  assert.deepEqual(rows.map((r) => r.cat), ['cbs', 'cbsread']);
  assert.deepEqual(rows.map((r) => r.role), ['0', '1']);
  // Both halves share one pairId so the engine can recover who served with whom.
  assert.equal(rows[0].pairId, rows[1].pairId);
  assert.equal(rows[0].pairId, '8_m9');
});

test('suggest history records the ministry part type and no pairId for a single slot', () => {
  const talk = { partKey: 'm3', cat: 'ministry', roleLabel: '學生', title: '初次交談' };
  const weeks = [week(9, '2026-10-01', [talk], [asg('mw9_m3_0', '甲')])];
  const [row] = buildSuggestPastHistory(weeks);
  assert.equal(row.type, '初次交談');
  assert.equal(row.pairId, null);
});
