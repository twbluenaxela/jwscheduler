import test from 'node:test';
import assert from 'node:assert/strict';
import { createTools } from './toolsCore.mjs';
import { dispatch } from './dispatch.mjs';

const validators = {
  quantity: (v) => v,
  note: (v) => v || null,
  status: (v) => v,
  id: Number,
  nonnegative: (v) => v,
  validateMonth: (v) => v,
};
const tools = createTools(validators);
const invoke = (ctx, name, args) => dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/call',
  params: { name, arguments: args } }, ctx, tools).then((response) => response.result);
const publication = { id: 4, code: 'gwt2', name: '聖經導讀', language: 'CHT', format: 'standard', category: 'book' };
function context() {
  const persons = [{ id: 1, name: '王秀蘭', serviceGroup: 'E組' }, { id: 2, name: '王小明', serviceGroup: 'F組' }];
  const created = [];
  const db = {
    person: { findMany: async () => persons },
    publication: { findMany: async () => [publication] },
    literatureRequest: {
      create: async ({ data }) => { const row = { id: 12, ...data }; created.push(row); return row; },
      findMany: async () => [],
    },
    literatureSubscription: { findMany: async () => [] },
    literatureDelivery: { findMany: async () => [] },
    shipment: { findFirst: async () => ({ id: 9, slipNumber: '3801436',
      lines: [{ shipmentId: 9, publicationId: 4, quantity: 3 }] }) },
    inventoryCount: { findFirst: async () => ({ id: 1, month: '2026-11', status: 'done' }) },
  };
  return { db, congregationId: 1, created };
}
test('add request creates for unique names and refuses ambiguous people', async () => {
  const ctx = context();
  const result = await invoke(ctx, 'add_request', { person: '秀蘭', publication: 'gwt2' });
  assert.equal(ctx.created.length, 1);
  assert.equal(ctx.created[0].personId, 1);
  assert.match(result.content[0].text, /聖經導讀.*#12/s);
  assert.equal(result.structuredContent.data.id, '12');
  assert.equal('congregationId' in result.structuredContent.data, false);
  const ambiguous = await invoke(ctx, 'add_request', { person: '王', publication: 'gwt2' });
  assert.equal(ambiguous.isError, true);
  assert.match(ambiguous.content[0].text, /王秀蘭（E組）.*王小明（F組）/);
  assert.equal(ctx.created.length, 1);
});
test('shipment sorting text includes groups, delivery marks and remainders', async () => {
  const ctx = context();
  ctx.db.literatureRequest.findMany = async () => [{ id: 12, personId: 1, publicationId: 4, quantity: 1, status: 'received' }];
  const result = await invoke(ctx, 'get_shipment_sorting', { slip_number: '3801436' });
  assert.match(result.content[0].text, /E組：\n  王秀蘭：✗ 聖經導讀 gwt2 ×1/);
  assert.match(result.content[0].text, /入庫餘量：\n  聖經導讀 gwt2 ×2/);
  assert.equal(result.structuredContent.data.groups['E組']['王秀蘭'][0].publication.id, '4');
});
test('set on hand refuses a completed count', async () => {
  const result = await invoke(context(), 'set_on_hand', { month: '2026-11', code_or_query: 'gwt2', on_hand: 9 });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /已完成清點/);
});
test('search tool returns useful rows in text and cleaned structured data', async () => {
  const result = await invoke(context(), 'search_publications', { query: 'gwt2' });
  assert.match(result.content[0].text, /#4 聖經導讀 gwt2.*中文.*一般/);
  assert.equal(result.structuredContent.data[0].id, '4');
});
