import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pairKey, buildPairIndex, recentPairing, partnersWithin,
  collectMidweekPairs, counterpartName, PAIR_REPEAT_WINDOW_DAYS,
} from './pairHistory.mjs';

const d = (y, m, day) => new Date(y, m - 1, day);
const REF = d(2026, 7, 1);

test('pairKey is order-independent', () => {
  assert.equal(pairKey('\u7532', '\u4e59'), pairKey('\u4e59', '\u7532'));
});

test('recentPairing finds a pairing inside the window, either direction', () => {
  const idx = buildPairIndex([
    { a: '\u7532', b: '\u4e59', date: d(2026, 5, 2) },   // 60 days before REF
    { a: '\u4e19', b: '\u4e01', date: d(2026, 8, 30) },  // 60 days after REF
  ]);
  assert.equal(recentPairing(idx, '\u4e59', '\u7532', REF).days, 60, 'order does not matter');
  assert.equal(recentPairing(idx, '\u7532', '\u4e59', REF).future, false);
  assert.equal(recentPairing(idx, '\u4e19', '\u4e01', REF).future, true, 'a future pairing counts too');
});

test('recentPairing ignores a pairing outside the window and on refDate itself', () => {
  const idx = buildPairIndex([
    { a: '\u7532', b: '\u4e59', date: d(2025, 1, 1) },  // way outside 180 days
    { a: '\u4e19', b: '\u4e01', date: REF },            // the assignment being edited
  ]);
  assert.equal(recentPairing(idx, '\u7532', '\u4e59', REF), null);
  assert.equal(recentPairing(idx, '\u4e19', '\u4e01', REF), null);
});

test('recentPairing window boundary is inclusive', () => {
  const inside = new Date(REF);
  inside.setDate(inside.getDate() - PAIR_REPEAT_WINDOW_DAYS);
  const outside = new Date(REF);
  outside.setDate(outside.getDate() - PAIR_REPEAT_WINDOW_DAYS - 1);
  assert.ok(recentPairing(buildPairIndex([{ a: 'x', b: 'y', date: inside }]), 'x', 'y', REF));
  assert.equal(recentPairing(buildPairIndex([{ a: 'x', b: 'y', date: outside }]), 'x', 'y', REF), null);
});

test('partnersWithin lists only partners inside the window', () => {
  const idx = buildPairIndex([
    { a: '\u7532', b: '\u4e59', date: d(2026, 5, 2) },
    { a: '\u7532', b: '\u4e19', date: d(2024, 5, 2) }, // too long ago
  ]);
  assert.deepEqual([...partnersWithin(idx, '\u7532', REF)], ['\u4e59']);
});

// ── collection from the app's own state ──────────────────────────────────────

const demo = (id) => ({ id, cat: 'ministry', roleLabel: '\u5b78\u751f/\u52a9\u624b', title: '\u521d\u6b21\u4ea4\u8ac7' });

test('collectMidweekPairs takes both halves of a filled demo part only', () => {
  const weeks = [{
    id: 42, date: '6\u6708 3\u65e5', treasures: [], living: [],
    ministry: [demo('m0'), demo('m1'), { id: 'm2', cat: 'ministry', roleLabel: '\u5b78\u751f', title: '\u6f14\u8b1b' }],
  }];
  const assignments = {
    'mw42_m0_0': '\u7532', 'mw42_m0_1': '\u4e59',  // full pair
    'mw42_m1_0': '\u4e19',                          // helper empty — not a pair
    'mw42_m2_0': '\u4e01',                          // single-slot talk — not a pair
  };
  const pairs = collectMidweekPairs(weeks, assignments);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].a, '\u7532');
  assert.equal(pairs[0].b, '\u4e59');
});

test('collectMidweekPairs ignores CBS pairs by default (tiny pool, repeats unavoidable)', () => {
  const weeks = [{
    id: 42, date: '6\u6708 3\u65e5', treasures: [], ministry: [],
    living: [{ id: 'cbs', cat: 'cbs', roleLabel: '\u4e3b\u6301/\u6717\u8b80', title: '\u7814\u7d93\u73ed' }],
  }];
  const assignments = { 'mw42_cbs_0': '\u7532', 'mw42_cbs_1': '\u4e59' };
  assert.equal(collectMidweekPairs(weeks, assignments).length, 0);
  assert.equal(collectMidweekPairs(weeks, assignments, ['ministry', 'cbs']).length, 1);
});

test('counterpartName returns the other half of a demo part, else empty', () => {
  const weeks = [{ id: 42, treasures: [], living: [], ministry: [demo('m0')] }];
  const assignments = { 'mw42_m0_0': '\u7532' };
  assert.equal(counterpartName('mw42_m0_1', weeks, assignments), '\u7532');
  assert.equal(counterpartName('mw42_m0_0', weeks, assignments), '', 'helper slot is empty');
  assert.equal(counterpartName('mw42_chairman', weeks, assignments), '');
});
