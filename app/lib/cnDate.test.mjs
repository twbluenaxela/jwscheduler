import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCnDate, parseIsoDate, toIsoDate, toCnLabel, resolveRowDate, resolveSequenceYears,
} from './cnDate.mjs';

const REF = new Date(2026, 7, 22); // 2026-08-22

test('parseIsoDate / toIsoDate round-trip in LOCAL time', () => {
  const d = parseIsoDate('2026-08-22');
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 7);
  assert.equal(d.getDate(), 22);
  // toISOString() would report the 21st for UTC+8 — the helper must not use it.
  assert.equal(toIsoDate(d), '2026-08-22');
  assert.equal(toIsoDate(new Date(2026, 0, 1)), '2026-01-01');
  assert.equal(parseIsoDate('nonsense'), null);
  assert.equal(parseIsoDate(null), null);
});

test('toCnLabel matches the stored display format', () => {
  assert.equal(toCnLabel(new Date(2026, 5, 3)), '6月 3日');
});

test('resolveRowDate prefers a stored isoDate over the ambiguous string', () => {
  // The string alone would infer Oct 2026; the stored date says Oct 2025.
  const row = { date: '10月 8日', isoDate: '2025-10-08' };
  assert.equal(+resolveRowDate(row, REF), +new Date(2025, 9, 8));
  // Without isoDate it falls back to inference, unchanged from before.
  assert.equal(+resolveRowDate({ date: '10月 8日' }, REF), +parseCnDate('10月 8日', REF));
  // Bare strings still work, so call sites can migrate incrementally.
  assert.equal(+resolveRowDate('10月 8日', REF), +parseCnDate('10月 8日', REF));
  assert.equal(resolveRowDate(null, REF), null);
});

test('resolveRowDate ignores a malformed isoDate rather than returning null', () => {
  const row = { date: '6月 3日', isoDate: 'garbage' };
  assert.equal(+resolveRowDate(row, REF), +parseCnDate('6月 3日', REF));
});

test('resolveSequenceYears rolls the year when the month goes backwards', () => {
  const rows = ['9月 16日', '12月 9日', '1月 13日', '5月 6日', '8月 5日'];
  const out = resolveSequenceYears(rows, { anchorIndex: 0, anchorYear: 2025 });
  assert.deepEqual(out.map((d) => toIsoDate(d)), [
    '2025-09-16', '2025-12-09', '2026-01-13', '2026-05-06', '2026-08-05',
  ]);
});

test('resolveSequenceYears anchors on the given index, dating earlier rows backwards', () => {
  const rows = ['11月 5日', '2月 4日', '6月 3日'];
  // Anchor the LAST row to 2026 → the first two must fall in 2025 / 2026.
  const out = resolveSequenceYears(rows, { anchorIndex: 2, anchorYear: 2026 });
  assert.deepEqual(out.map((d) => toIsoDate(d)), ['2025-11-05', '2026-02-04', '2026-06-03']);
});

test('resolveSequenceYears spans more than one year, which inference cannot', () => {
  const rows = ['1月 7日', '7月 1日', '1月 6日', '7月 7日'];
  const out = resolveSequenceYears(rows, { anchorIndex: 0, anchorYear: 2025 });
  assert.deepEqual(out.map((d) => toIsoDate(d)), [
    '2025-01-07', '2025-07-01', '2026-01-06', '2026-07-07',
  ]);
});

test('resolveSequenceYears tolerates unparseable rows without derailing the walk', () => {
  const rows = ['12月 9日', '大會', '1月 13日'];
  const out = resolveSequenceYears(rows, { anchorIndex: 0, anchorYear: 2025 });
  assert.equal(toIsoDate(out[0]), '2025-12-09');
  assert.equal(out[1], null);
  assert.equal(toIsoDate(out[2]), '2026-01-13');
});

test('parseCnDate is unchanged (legacy fallback behaviour)', () => {
  assert.equal(+parseCnDate('10月 8日', REF), +new Date(2026, 9, 8));
  assert.equal(+parseCnDate('8/9', REF), +new Date(2026, 7, 9));
  assert.equal(parseCnDate('nope', REF), null);
});
