import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCatalog, groupPeople, validateSubmission, flagSubmission, isStanding, defaultKind, editionGroups } from './publicForm.mjs';

const pub = (id, code, extra = {}) => ({ id, code, name: code, category: 'study', language: 'CHT', format: 'standard', active: true, ...extra });
const publications = [pub(1, 'w26.01'), pub(2, 'w26.02'), pub(3, 'w26.03'), pub(4, 'w26.04'), pub(5, 'book'), pub(6, 'form', { category: 'form' }), pub(7, 'off', { requestable: false }), pub(8, 'inactive', { active: false })];
const people = [{ id: 1, name: '甲', serviceGroup: 'A' }, { id: 2, name: '乙', status: 'inactive' }];
const validate = body => validateSubmission({ body, people, publications });

test('catalog filters, keeps latest issues per variant, and maps covers', () => {
  const rows = publicCatalog([...publications, pub(9, 'w26.01', { language: 'ENG', coverToken: 'abc' })]);
  assert.deepEqual(rows.map(p => p.id), ['5', '9', '2', '3', '4']);
  assert.equal(rows.find(p => p.id === '9').coverUrl, '/api/literature/covers/abc');
  assert.equal(isStanding(publications[0]), true);
  assert.equal(isStanding(pub(10, 'g26.01')), false);
});
test('bare periodical cards default to 定期 for members, 單次 for guests', () => {
  for (const code of ['w', 'mwb', 'wlp', 'w27.01', 'mwb27.03', 'wlp27.01']) {
    const card = pub(20, code, { language: 'JPN', format: 'large' });
    assert.equal(isStanding(card), true, code);
    assert.equal(defaultKind(card), 'standing', code);
    assert.equal(defaultKind(card, true), 'once', code);
  }
  assert.equal(isStanding(pub(21, 'wp')), false);
  assert.equal(defaultKind(pub(21, 'wp')), 'once');
  assert.equal(publicCatalog([pub(22, 'w', { language: 'ENG' })])[0].series, 'w');
  const bare = pub(23, 'mwb', { language: 'ENG' });
  const validateBare = body => validateSubmission({ body, people, publications: [...publications, bare] });
  assert.equal(validateBare({ personId: 1, items: [{ publicationId: 23, quantity: 1 }] }).items[0].kind, 'standing');
  assert.equal(validateBare({ guest: { name: '訪客' }, items: [{ publicationId: 23, quantity: 1 }] }).items[0].kind, 'once');
  assert.deepEqual(
    validateBare({ personId: 1, items: [{ publicationId: 23, quantity: 1 }, { publicationId: 23, quantity: 2 }] }).items,
    [{ publicationId: 23, quantity: 3, kind: 'standing' }],
  );
  assert.equal(validate({ personId: 1, items: [{ publicationId: 5, quantity: 1 }] }).items[0].kind, 'once');
});
test('edition groups give periodicals 中/英/日 via generic cards, other titles only real rows', () => {
  const all = publicCatalog([
    pub(1, 'w26.11', { language: 'CHT', coverToken: 'a' }),
    pub(2, 'w', { language: 'CHT' }), pub(3, 'w', { language: 'ENG' }), pub(4, 'w', { language: 'JPN' }),
    pub(5, 'wcg', { language: 'CHT', category: 'book' }), pub(6, 'wcg', { language: 'ENG', category: 'book' }),
    pub(7, 'nwt', { language: 'CHT', category: 'bible' }),
  ]);
  const groups = editionGroups(all, all);
  const study = groups.find((g) => g.code === 'w26.11');
  assert.deepEqual(study.variants.map((v) => v.label), ['中', '英', '日']);
  assert.equal(study.variants[1].publication.language, 'ENG');
  assert.equal(study.variants[1].publication.code, 'w26.11');
  assert.equal(study.variants[1].publication.synthetic, true);
  assert.deepEqual(groups.find((g) => g.code === 'wcg').variants.map((v) => v.label), ['中', '英']);
  assert.deepEqual(groups.find((g) => g.code === 'nwt').variants.map((v) => v.label), ['中']);
});
test('groups include active people and ungrouped people in order', () => {
  const groups = groupPeople([...people, { id: 3, name: '丙', serviceGroup: null }]);
  assert.deepEqual(groups.map(g => g.group), ['A', 'B', 'C', 'D', 'E', '未分組']);
  assert.deepEqual(groups[0].people.map(p => p.id), ['1']);
  assert.equal(groups[5].people[0].name, '丙');
});
test('submission validates identity, item limits, quantities, kinds and merges duplicates', () => {
  const line = { publicationId: 4, quantity: 2, kind: 'once' };
  assert.deepEqual(validate({ personId: '1', items: [line, line] }).items, [{ publicationId: 4, quantity: 4, kind: 'once' }]);
  assert.equal(validate({ guest: { name: ' 訪客 ', note: ' 註 ' }, items: [line] }).guestName, '訪客');
  for (const body of [
    { items: [line] }, { personId: 1, guest: { name: '訪客' }, items: [line] }, { personId: 2, items: [line] },
    { guest: { name: ' ' }, items: [line] }, { guest: { name: '名'.repeat(31) }, items: [line] },
    { guest: { name: '甲', note: '註'.repeat(201) }, items: [line] }, { personId: 1, items: [] },
    { personId: 1, items: Array(31).fill(line) }, { personId: 1, items: [{ ...line, quantity: 0 }] },
    { personId: 1, items: [{ ...line, quantity: 21 }] }, { personId: 1, items: [{ ...line, kind: 'bad' }] },
    { personId: 1, items: [{ ...line, publicationId: 1 }] }, { personId: 1, items: [{ ...line, publicationId: 5, kind: 'standing' }] },
    { guest: { name: '甲' }, items: [{ ...line, kind: 'standing' }] },
    { personId: 1, items: [{ ...line, quantity: 11 }, { ...line, quantity: 10 }] },
  ]) assert.throws(() => validate(body));
  assert.equal(validate({ personId: 1, items: [{ ...line, kind: 'standing' }] }).items[0].kind, 'standing');
});
test('flags each reason in order', () => {
  const items = Array.from({ length: 11 }, (_, i) => ({ quantity: i ? 1 : 6, kind: i ? 'once' : 'standing', series: 'w', language: 'CHT' }));
  assert.deepEqual(flagSubmission({ items, previousSubs: [{ series: 'w', language: 'CHT', active: true, quantity: 2 }], recentCount: 1, guest: true }), { flagged: true, reason: '數量超過 5、超過 10 項、定期變更、10 分鐘內重複送出、名單外' });
  assert.deepEqual(flagSubmission({ items: [{ quantity: 1, kind: 'once' }] }), { flagged: false, reason: null });
});

test('public sections classify periodicals, tools and ordinary publications', async () => {
  const { publicSection } = await import('./publicForm.mjs');
  for (const [code, category, expected] of [
    ['T-30', 'toolbox', { section: 'tracts' }],
    ['inv', 'toolbox', { section: 'tracts' }],
    ['jwcd1', 'toolbox', { section: 'tracts' }],
    ['lff', 'toolbox', { section: 'toolbox' }],
    ['w26.09', 'study', { section: 'magazines', sub: 'study' }],
    ['wp26.1', 'magazine', { section: 'magazines', sub: 'wp' }],
    ['g26.1', 'magazine', { section: 'magazines', sub: 'g' }],
    ['mwb26.11', 'study', { section: 'workbook' }],
    ['es27', 'book', { section: 'book' }],
  ]) {
    assert.deepEqual(publicSection({ code, category }), expected);
  }
});

test('submission note is trimmed, optional and limited to 300 characters', () => {
  const body = { personId: 1, items: [{ publicationId: 4, quantity: 1, kind: 'once' }] };
  assert.equal(validate(body).note, null);
  assert.equal(validate({ ...body, note: '  紙本  ' }).note, '紙本');
  assert.equal(validate({ ...body, note: ' '.repeat(3) }).note, null);
  assert.throws(() => validate({ ...body, note: '字'.repeat(301) }), /備註不可超過 300 個字/);
  assert.throws(() => validate({ ...body, note: 2 }), /備註不可超過 300 個字/);
});
