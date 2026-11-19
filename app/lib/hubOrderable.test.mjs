import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHubList, planOrderableSync, newPublicationFor, scopeOf, sectionLabel } from './hubOrderable.mjs';

const SAMPLE = `桃園市新屋區新屋會眾 (32714)
守望台（公眾版）
結果：7

* wp26.1-CH | 中文繁體（國語）
[守望台（公眾版）](https://hub.example/a)
[2026年No. 1](https://hub.example/a)
* wp18.3-CH | 中文繁體（國語）
[守望台（公眾版）](https://hub.example/b)
[2018年No. 3](https://hub.example/b)

書籍 | 標準本
結果：28

* be-CH | 中文繁體（國語）
[神聖教育使你得益——傳道訓練班課本](https://hub.example/c)
* it-1-CH | 中文繁體（國語）
   * 特別預訂
[洞悉聖經 - 第1集](https://hub.example/d)
* [標準本](https://hub.example/nav#anchor)

書籍 | 大字本
結果：8

* bhsls-CH | 中文繁體（國語）
   * 特別預訂
[我們能從聖經學到什麼？（放大本）](https://hub.example/e)

書籍 | 盲文點字
* lfb-CH BR1 | 中文繁體（國語）
   * 一級盲文點字
[大家一起學聖經](https://hub.example/f)

冊子 | 其他冊子
* gwt1-CH | 中文繁體（國語）
   * 特別預訂
[上帝的話語就是真理：聖經導讀（以西結書－約珥書）](https://hub.example/g)

傳單 | 其他傳單
* T-pry-CH | 中文繁體（國語）
[祈禱有用嗎？（傳單）](https://hub.example/h)
---`;

const find = (items, code, format = 'standard') => items.find((x) => x.code === code && x.format === format);

test('parseHubList reads sections, codes, specials, large format and skips braille and nav chrome', () => {
  const { sections, items } = parseHubList(SAMPLE);
  assert.deepEqual([...sections].sort(), ['book', 'brochure', 'tract', 'wp']);
  assert.equal(items.length, 7);
  assert.equal(find(items, 'wp26.1').name, '《守望台》2026年1期');
  assert.equal(find(items, 'wp18.3').name, '《守望台》2018年3期');
  assert.equal(find(items, 'be').name, '神聖教育使你得益——傳道訓練班課本');
  assert.equal(find(items, 'it-1').name, '洞悉聖經 - 第1集');
  assert.equal(find(items, 'bhsls', 'large').format, 'large');
  assert.equal(find(items, 'bhsls', 'large').specialOrder, true);
  assert.equal(find(items, 'it-1').specialOrder, true);
  assert.equal(find(items, 'gwt1').specialOrder, true);
  assert.equal(find(items, 'T-pry').section, 'tract');
  assert.equal(items.some((x) => x.code === 'lfb'), false, 'braille section skipped');
  assert.equal(items.some((x) => x.name.includes('標準本')), false, 'nav links ignored');
  assert.equal(find(items, 'be').specialOrder, false);
  assert.equal(sectionLabel('brochure'), '冊子');
});

test('parseHubList builds 警醒 names and dedupes by code + format', () => {
  const pasted = `警醒！
* g18.3-CH | 中文繁體（國語）
[警醒！](https://hub.example/a)
[2018年No. 3](https://hub.example/a)
* g18.3-CH | 中文繁體（國語）
[警醒！](https://hub.example/a)
[2018年No. 3](https://hub.example/a)
書籍 | 大字本
* be-CH | 中文繁體（國語）
[神聖教育（放大本）](https://hub.example/b)
書籍 | 標準本
* be-CH | 中文繁體（國語）
[神聖教育](https://hub.example/c)`;
  const { items } = parseHubList(pasted);
  assert.equal(items.length, 3);
  assert.equal(find(items, 'g18.3').name, '《警醒！》2018年3期');
  assert.equal(find(items, 'be', 'large').name, '神聖教育（放大本）');
  assert.equal(find(items, 'be', 'standard').name, '神聖教育');
});

const pub = (id, code, extra = {}) => ({
  id, code, name: code, category: 'book', language: 'CHT', format: 'standard',
  orderable: true, specialOrder: false, ...extra,
});

const PASTE = `守望台（公眾版）
* wp18.3-CH | 中文繁體（國語）
[守望台（公眾版）](https://hub.example/a)
[2018年No. 3](https://hub.example/a)

書籍 | 標準本
* be-CH | 中文繁體（國語）
[神聖教育](https://hub.example/c)
* it-1-CH | 中文繁體（國語）
   * 特別預訂
[洞悉聖經](https://hub.example/d)

書籍 | 大字本
* bhsls-CH | 中文繁體（國語）
   * 特別預訂
[我們能從聖經學到什麼？（放大本）](https://hub.example/e)

冊子 | 其他冊子
* gwt1-CH | 中文繁體（國語）
   * 特別預訂
[上帝的話語就是真理](https://hub.example/g)`;

const catalog = () => {
  const parsed = parseHubList(PASTE);
  const pubs = [
    pub(1, 'be', { specialOrder: true }),            // present, specialOff
    pub(2, 'oldbook'),                                // absent, close
    pub(3, 'it-1', { orderable: false }),             // present, open + specialOn
    pub(4, 'gwt1', { category: 'brochure', specialOrder: true }), // present, already special
    pub(5, 'gwt2', { category: 'brochure', specialOrder: true }), // absent, close (no specialOff)
    pub(6, 'wp18.3', { category: 'magazine' }),       // present, untouched
    pub(7, 'wp20.1', { category: 'magazine' }),       // absent, close
    pub(9, 'nwt', { category: 'bible' }),             // out of scope
    pub(10, 'w26.01', { category: 'study' }),         // out of scope
    pub(11, 'T-30', { category: 'toolbox' }),         // tract not in parsed.sections
    pub(12, 'be', { language: 'ENG' }),               // wrong language
    pub(13, 'other-x'),                               // out of scope
  ];
  return { parsed, pubs };
};

test('planOrderableSync computes open/close/add/special diffs and leaves other scopes alone', () => {
  const { parsed, pubs } = catalog();
  const plan = planOrderableSync(pubs, parsed);
  assert.deepEqual(plan.open.map((p) => p.id), [3]);
  assert.deepEqual(plan.close.map((p) => p.id), [2, 5, 7]);
  assert.deepEqual(plan.add.map((i) => i.code), ['bhsls']);
  assert.equal(plan.add[0].format, 'large');
  assert.deepEqual(plan.specialOn.map((p) => p.id), [3]);
  assert.deepEqual(plan.specialOff.map((p) => p.id), [1]);
  for (const id of [4, 6, 9, 10, 11, 12, 13]) {
    for (const bucket of Object.values(plan)) assert.equal(bucket.some((x) => String(x.id) === String(id)), false, `id ${id} untouched`);
  }
});

test('planOrderableSync only syncs scopes present in the paste', () => {
  const bookOnly = parseHubList(`書籍 | 標準本
* be-CH | 中文繁體（國語）
[神聖教育](https://hub.example/c)`);
  const pubs = [
    pub(1, 'wp18.3', { category: 'magazine' }),
    pub(2, 'g20.1', { category: 'magazine' }),
    pub(3, 'T-30', { category: 'toolbox' }),
    pub(4, 'oldbook'),
    pub(5, 'be'),
  ];
  const plan = planOrderableSync(pubs, bookOnly);
  assert.deepEqual(plan.close.map((p) => p.id), [4]);
  assert.equal(plan.open.length, 0);
  assert.equal(plan.add.length, 0);
});

test('planOrderableSync matches Hub lp/ls large codes to the base code with large format', () => {
  const largePaste = `書籍 | 大字本
* wcglp-CH | 中文繁體（國語）
[上帝的話語就是真理](https://hub.example/lp)
* bhsls-CH | 中文繁體（國語）
   * 特別預訂
[我們能從聖經學到什麼？（放大本）](https://hub.example/ls)`;
  const parsed = parseHubList(largePaste);
  const pubs = [
    pub(1, 'wcg', { format: 'large', orderable: false }), // base code, large — must match wcglp
    pub(2, 'bhsls', { format: 'large' }),                  // exact code, large
  ];
  const plan = planOrderableSync(pubs, parsed);
  assert.deepEqual(plan.add, [], 'no add');
  assert.deepEqual(plan.close, [], 'no close');
  assert.deepEqual(plan.open.map((p) => p.id), [1]);
  assert.deepEqual(plan.specialOn.map((p) => p.id), [2]);

  // A large item whose catalog row is only exact-code/standard must not be touched.
  const standardOnly = planOrderableSync([pub(3, 'wcglp', { format: 'standard' })], parsed);
  assert.deepEqual(standardOnly.add.map((i) => i.code), ['wcglp', 'bhsls']);
  assert.deepEqual(standardOnly.close, [], 'standard row left alone');
  assert.deepEqual(standardOnly.open, []);
});

test('planOrderableSync is idempotent once applied', () => {
  const { parsed, pubs } = catalog();
  const first = planOrderableSync(pubs, parsed);
  const applied = pubs.map((p) => ({ ...p }));
  const applyIds = (list, patch) => list.forEach((p) => Object.assign(applied.find((x) => x.id === p.id), patch));
  applyIds(first.open, { orderable: true });
  applyIds(first.close, { orderable: false });
  applyIds(first.specialOn, { specialOrder: true });
  applyIds(first.specialOff, { specialOrder: false });
  for (const item of first.add) applied.push({ ...newPublicationFor(item), id: 100 + applied.length });
  const second = planOrderableSync(applied, parsed);
  for (const bucket of Object.values(second)) assert.deepEqual(bucket, []);
});

test('scopeOf classifies only the synced CHT catalog families', () => {
  assert.equal(scopeOf({ code: 'wp26.1', category: 'magazine', language: 'CHT' }), 'wp');
  assert.equal(scopeOf({ code: 'g18.3', category: 'magazine', language: 'CHT' }), 'g');
  assert.equal(scopeOf({ code: 'be', category: 'book', language: 'CHT' }), 'book');
  assert.equal(scopeOf({ code: 'gwt1', category: 'brochure' }), 'brochure');
  assert.equal(scopeOf({ code: 'T-pry', category: 'toolbox' }), 'tract');
  assert.equal(scopeOf({ code: 'inv', category: 'toolbox' }), 'tract');
  for (const p of [
    { code: 'nwt', category: 'bible' }, { code: 'w26.01', category: 'study' },
    { code: 'jwcd1', category: 'toolbox' }, { code: 'other-x', category: 'book' },
    { code: 'T-30', category: 'toolbox', language: 'ENG' }, { code: 'form', category: 'form' },
  ]) assert.equal(scopeOf(p), null);
});

test('newPublicationFor builds a catalog-ready CHT row', () => {
  const row = newPublicationFor({ code: 'T-pry', name: '祈禱有用嗎？', section: 'tract', format: 'standard', specialOrder: true });
  assert.deepEqual(row, {
    code: 'T-pry', name: '祈禱有用嗎？', category: 'toolbox', hubGroup: '傳單', language: 'CHT',
    format: 'standard', orderable: true, specialOrder: true, active: true, requestable: true, onS28: false, aliases: [],
  });
  assert.equal(newPublicationFor({ code: 'wp26.1', name: 'x', section: 'wp' }).hubGroup, '公眾版雜誌');
});
