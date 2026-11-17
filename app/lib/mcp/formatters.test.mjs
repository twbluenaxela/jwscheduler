import test from 'node:test';
import assert from 'node:assert/strict';
import { formatResult, cleanResult } from './formatters.mjs';

test('inventory text highlights activity and limits uncounted codes, while structured data retains every line', () => {
  const rows = [
    { publication: { id: 1, code: 'active', name: '有庫存' }, opening: 5, received: 2, onHand: 3, distributed: 4 },
    { publication: { id: 2, code: 'received', name: '有收' }, opening: 0, received: 1, onHand: 0, distributed: 1 },
    { publication: { id: 3, code: 'negative', name: '有發' }, opening: 0, received: 0, onHand: 0, distributed: -1 },
    { publication: { id: 4, code: 'zero', name: '零' }, opening: 0, received: 0, onHand: 0, distributed: 0 },
    ...Array.from({ length: 22 }, (_, index) => ({ publication: { id: index + 5, code: `u${index}`, name: '未清點' },
      opening: 0, received: 0, onHand: null, distributed: null })),
  ];
  const data = { count: { month: '2026-11' }, lines: rows };
  const text = formatResult('get_inventory', '2026-11 庫存清點：4/26', data);
  assert.match(text, /^2026-11 庫存清點：4\/26\n/);
  assert.match(text, /有庫存 active｜原有 5｜收 2｜現有 3｜發 4/);
  assert.match(text, /有收 received/);
  assert.match(text, /有發 negative/);
  assert.doesNotMatch(text, /零 zero|期初|收到|發出/);
  assert.match(text, /未清點：22 項（u0、/);
  assert.match(text, /u19）/);
  assert.doesNotMatch(text, /u20|u21/);
  assert.equal(cleanResult(data).lines.length, 26);
  assert.equal(cleanResult(data).lines[25].publication.id, '26');
});

test('inventory update uses S-28 labels', () => {
  const text = formatResult('set_on_hand', '已更新', { onHand: 9, opening: 3, received: 2 });
  assert.match(text, /現有 9｜原有 3｜收 2/);
  assert.doesNotMatch(text, /期初|收到|發出/);
});

test('order checklist formats standing order changes', () => {
  const rows = [{ label: '守望台研讀版中文', now: 10, last: 5, diff: 5 }];
  const text = formatResult('order_checklist', '定期訂單核對', rows);
  assert.match(text, /守望台研讀版中文：現在 10 本，上次到 5 本，改成 10/);
});
