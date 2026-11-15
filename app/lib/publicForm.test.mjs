import test from 'node:test';
import assert from 'node:assert/strict';
import { publicCatalog, groupPeople, validateSubmission, flagSubmission, isStanding } from './publicForm.mjs';

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
