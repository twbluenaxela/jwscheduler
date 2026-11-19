import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCheck, applyUncheck, buildChecklist, pendingStats } from './handoutChecklist.mjs';

const items = (count, prefix = 'i') => Array.from({ length: count }, (_, i) => ({ key: `${prefix}${i}`, quantity: i + 1 }));
const person = (overrides = {}) => ({ personId: 7, name: '蔡麗芬', items: items(2), ...overrides });

test('merges pending and delivered rows and counts unchecked quantities', () => {
  const result = buildChecklist({ people: [person({ items: [{ key: 'i1', quantity: 2 }] })], delivered: [{ ...person(), items: [{ key: 'd:10', quantity: 1, deliveryId: 10 }] }] });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].items.map((item) => item.checked), [false, true]);
  assert.equal(result[0].items[1].deliveryId, 10);
  assert.deepEqual(pendingStats(result), { people: 1, quantity: 2 });
  const done = buildChecklist({ delivered: [{ ...person(), items: items(2).map((item, i) => ({ ...item, deliveryId: i + 1 })) }] });
  assert.equal(done[0].done, true);
  assert.equal(done[0].checkedCount, 2);
});

test('guest keys stay separate from member keys', () => {
  const result = buildChecklist({ people: [person(), person({ personId: null, guest: true, guestKey: 'guest:r1' })] });
  assert.equal(result.length, 2);
});

test('partial delivery, undo, redo, and repeated bulk toggles keep one stable entry', () => {
  const original = buildChecklist({ people: [person({ items: items(7) })] });
  let list = original;
  const keys = original[0].items.map((item) => item.key);
  const check = (selected) => { list = applyCheck(list, '7', selected, { at: '2026-01-01T00:00:00Z' }); };
  const uncheck = (selected) => { list = applyUncheck(list, '7', selected); };
  const verify = () => {
    assert.equal(list.length, 1);
    assert.equal(list[0].items.length, 7);
    assert.equal(new Set(list[0].items.map((item) => item.key)).size, 7);
    assert.equal(list[0].done, list[0].checkedCount === 7);
  };
  for (let round = 0; round < 3; round++) {
    check([keys[0]]); verify();
    uncheck([keys[0]]); verify();
    check([keys[0]]); verify();
    check(keys.filter((key) => !list[0].items.find((item) => item.key === key).checked)); verify();
    uncheck([keys[0]]); verify();
  }
});

test('server partial state containing the same person in both arrays remains one entry', () => {
  const result = buildChecklist({ people: [person()], delivered: [{ ...person(), items: [{ key: 'd:42', quantity: 1, deliveryId: 42 }] }] });
  assert.equal(result.filter((entry) => entry.key === '7').length, 1);
});

test('item order stays stable when an item changes between pending and delivered', () => {
  const pendingItem = { key: 'pending-x', publicationId: 2, requestId: null, source: 'subscription', label: 'X', quantity: 1 };
  const deliveredItem = { ...pendingItem, key: 'd:42', deliveryId: 42 };
  const otherItem = { key: 'y', publicationId: 10, requestId: null, source: 'subscription', label: 'Y', quantity: 1 };
  const pendingBuild = buildChecklist({ people: [person({ items: [otherItem, pendingItem] })] });
  const deliveredBuild = buildChecklist({
    people: [person({ items: [otherItem] })],
    delivered: [{ ...person(), items: [deliveredItem] }],
  });
  const pendingXIndex = pendingBuild[0].items.findIndex((item) => item.label === 'X');
  const deliveredXIndex = deliveredBuild[0].items.findIndex((item) => item.label === 'X');
  assert.equal(pendingXIndex, deliveredXIndex);
});
