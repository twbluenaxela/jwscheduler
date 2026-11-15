import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CATEGORY_LABELS, CATEGORY_ORDER, FORMAT_LABELS, LANGUAGE_LABELS, normalizeText, parseVariantHints, matchPublications, sortPublications, periodicalEntry, seedRowsFor } from './literature.mjs';
const seed = JSON.parse(readFileSync(new URL('../data/literature-seed.json', import.meta.url)));
test('seed identities and S-28 order', () => {
  assert.equal(new Set(seed.map(p => JSON.stringify([p.code, p.language, p.format]))).size, seed.length);
  for (const p of seed) {
    assert.ok(Object.hasOwn(CATEGORY_LABELS, p.category), `Invalid category: ${p.code}`);
    assert.ok(Object.hasOwn(FORMAT_LABELS, p.format), `Invalid format: ${p.code}`);
  }
  for (const code of ['es27', 'wcg', 'wlp', 'gwt1', 'gwt2', 'T-dth']) {
    assert.ok(seed.some(p => p.code === code), `Missing code: ${code}`);
  }
  assert.deepEqual(seed.filter(p => p.onS28).map(p => p.s28Order), Array.from({length:97}, (_,i) => i+1));
  assert.equal(seedRowsFor(42, seed)[0].congregationId, 42);
  assert.deepEqual(seedRowsFor(42, seed)[0].aliases, seed[0].aliases);
  assert.deepEqual(seedRowsFor(42, [{}])[0].aliases, []);
});
test('labels, normalization and variant hints', () => {
  assert.equal(CATEGORY_LABELS.study, '研讀版／手冊'); assert.equal(CATEGORY_ORDER[0], 'bible');
  assert.equal(FORMAT_LABELS.large, '大字版'); assert.equal(LANGUAGE_LABELS.ENG, '英文');
  assert.equal(normalizeText('《Ａ b》（Ｃ）·'), 'abc');
  assert.deepEqual(parseVariantHints('大字版守望台'), {rest:'守望台',format:'large',language:null});
  assert.deepEqual(parseVariantHints('英文守望台'), {rest:'守望台',format:null,language:'ENG'});
  assert.equal(parseVariantHints('袖珍日文').format, 'pocket');
});
test('matching and ordering', () => {
  for (const q of ['大字 守望台','大字版守望台']) assert.equal(matchPublications(q,seed)[0].code, 'wlp');
  assert.equal(matchPublications('T-31',seed)[0].code.toLowerCase(), 't-31');
  assert.equal(matchPublications('5445',seed)[0].code, 'lff');
  assert.equal(matchPublications('英文守望台',seed)[0].language, 'ENG');
  assert.deepEqual(matchPublications('',seed), sortPublications(seed).slice(0,20));
  assert.equal(matchPublications('5445', [{...seed.find(p => p.code === 'lff'), active:false}]).length, 0);
});
test('periodical dates', () => {
  assert.deepEqual(periodicalEntry('w',2026,10), {code:'w26.10',issue:'2026-10',category:'study',name:'守望台研讀版 2026年10月'});
  assert.equal(periodicalEntry('mwb',2027,1).code,'mwb27.01');
  assert.equal(periodicalEntry('w', 2027, 3).code, 'w27.03');
  assert.deepEqual(periodicalEntry('w', 2027, 2, { format: 'large' }), { code: 'wlp27.02', issue: '2027-02', category: 'study', name: '守望台研讀版（大字版） 2027年2月' });
  assert.equal(periodicalEntry('mwb', 2027, 5, { format: 'large' }).code, 'mwb27.05');
  for (const args of [['x',2026,1],['w',2019,1],['w',2026,13],['w',2026,1.5]]) assert.throws(() => periodicalEntry(...args));
});

test('cover fallback matches code and format without mutating items', async () => {
  const { withCoverFallback } = await import('./literature.mjs');
  const items = [
    { code: 'w27.01', format: 'standard', language: 'CHT', coverUrl: '/cover.jpg' },
    { code: 'w27.01', format: 'standard', language: 'ENG', coverUrl: null },
    { code: 'w27.01', format: 'large', language: 'JPN', coverUrl: null },
  ];
  const result = withCoverFallback(items);
  assert.equal(result[1].coverUrl, '/cover.jpg');
  assert.equal(result[2].coverUrl, null);
  assert.equal(items[1].coverUrl, null);
});
