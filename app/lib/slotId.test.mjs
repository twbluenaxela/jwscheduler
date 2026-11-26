import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMidweekSlotId, buildMidweekSlotId } from './slotId.mjs';

test('parses the fixed section slots', () => {
  assert.deepEqual(parseMidweekSlotId('mw42_chairman'), { weekId: 42, key: 'chairman', partKey: null, index: null });
  assert.deepEqual(parseMidweekSlotId('mw42_openPrayer'), { weekId: 42, key: 'openPrayer', partKey: null, index: null });
  assert.deepEqual(parseMidweekSlotId('mw42_closePrayer'), { weekId: 42, key: 'closePrayer', partKey: null, index: null });
});

test('parses EPUB part slots', () => {
  assert.deepEqual(parseMidweekSlotId('mw42_t0_0'), { weekId: 42, key: null, partKey: 't0', index: 0 });
  assert.deepEqual(parseMidweekSlotId('mw42_m1_1'), { weekId: 42, key: null, partKey: 'm1', index: 1 });
  assert.deepEqual(parseMidweekSlotId('mw42_cbs_0'), { weekId: 42, key: null, partKey: 'cbs', index: 0 });
});

test('parses an added part whose partKey contains underscores', () => {
  const key = 'x_0123456789abcdef0123456789abcdef';
  assert.deepEqual(parseMidweekSlotId(`mw37_${key}_0`), { weekId: 37, key: null, partKey: key, index: 0 });
  assert.deepEqual(parseMidweekSlotId(`mw37_${key}_1`), { weekId: 37, key: null, partKey: key, index: 1 });
});

test('keeps a partKey that itself ends in _<digits>', () => {
  assert.deepEqual(parseMidweekSlotId('mw1_x_ab_12_0'), { weekId: 1, key: null, partKey: 'x_ab_12', index: 0 });
});

test('a slot without a trailing index keeps the whole rest as partKey', () => {
  assert.deepEqual(parseMidweekSlotId('mw42_cbs'), { weekId: 42, key: null, partKey: 'cbs', index: null });
});

test('rejects non-midweek and malformed slot IDs', () => {
  assert.equal(parseMidweekSlotId('we7_speaker'), null);
  assert.equal(parseMidweekSlotId('mw42'), null);
  assert.equal(parseMidweekSlotId('mw42x_t0'), null);
  assert.equal(parseMidweekSlotId(''), null);
  assert.equal(parseMidweekSlotId(null), null);
});

test('buildMidweekSlotId round-trips, including underscore keys', () => {
  const key = 'x_0123456789abcdef0123456789abcdef';
  assert.equal(buildMidweekSlotId(37, key, 0), `mw37_${key}_0`);
  assert.equal(buildMidweekSlotId(42, 't0', 1), 'mw42_t0_1');
  assert.equal(buildMidweekSlotId(42, 'chairman'), 'mw42_chairman');
  assert.deepEqual(parseMidweekSlotId(buildMidweekSlotId(37, key, 1)), { weekId: 37, key: null, partKey: key, index: 1 });
});
