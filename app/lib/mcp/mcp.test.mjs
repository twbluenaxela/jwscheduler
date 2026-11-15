import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatch } from './dispatch.mjs';
import { resolvePerson, resolvePublication } from './resolution.mjs';

const tools = [{ name: 'example', description: '範例', inputSchema: {}, handler: async () => ({ summary: '完成', data: { name: '完成' } }) }];
test('JSON-RPC initialization, discovery, calls and notifications', async () => {
  const userContext = { user: { canLiterature: true } };
  const request = (method, params = {}) => ({ jsonrpc: '2.0', id: 1, method, params });
  assert.equal((await dispatch(request('initialize', { protocolVersion: '2024-11-05' }), {}, tools)).result.protocolVersion, '2024-11-05');
  assert.equal((await dispatch(request('initialize', { protocolVersion: 'other' }), {}, tools)).result.protocolVersion, '2025-06-18');
  assert.equal((await dispatch(request('tools/list'), userContext, tools)).result.tools[0].name, 'example');
  assert.equal((await dispatch(request('tools/call', { name: 'example' }), userContext, tools)).result.structuredContent.data.name, '完成');
  assert.equal((await dispatch(request('missing'), {}, tools)).error.code, -32601);
  assert.equal(await dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }, {}, tools), null);
});
test('resolves people exactly, partially, and refuses ambiguity', () => {
  const rows = [{ name: '王秀蘭', serviceGroup: '一' }, { name: '王小明', serviceGroup: '二' }];
  assert.equal(resolvePerson('王秀蘭', rows), rows[0]);
  assert.equal(resolvePerson('秀蘭', rows), rows[0]);
  assert.throws(() => resolvePerson('王', rows), /王小明（二）/);
});
test('resolves publications and refuses ambiguous variants', () => {
  const rows = [{ id: 1, code: 'lff', name: '聖經導讀', language: 'CHT', format: 'standard', category: 'book' },
    { id: 2, code: 'lff', name: '聖經導讀', language: 'ENG', format: 'standard', category: 'book' },
    { id: 3, code: 'gwt2', name: '聖經譯本', language: 'CHT', format: 'standard', category: 'book' }];
  assert.equal(resolvePublication({ publication_id: '1' }, rows).id, 1);
  assert.equal(resolvePublication({ publication: '譯本' }, rows).id, 3);
  assert.throws(() => resolvePublication({ publication: 'lff' }, rows), /不明確/);
});
