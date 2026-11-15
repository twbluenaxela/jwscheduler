import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWeek, resolvePart, scheduleTools } from './scheduleTools.mjs';
import { dispatch } from './dispatch.mjs';
import { calendarResponse } from '../calendarFeed.mjs';
import { makeFakeDb } from '../test-support/fake-db.mjs';

const week = { id: 42, congregationId: 1, date: '1月 2日', isoDate: '2027-01-02', parts: [
  { partKey: 't0', partNum: 4, title: '經文朗讀', cat: 'reading', roleLabel: '學生' },
  { partKey: 'm0', partNum: 5, title: '傳道示範', cat: 'ministry', roleLabel: '學生/助手' },
], assignments: [] };
test('週次解析使用台北日期、跨年和同週週末', () => {
  const now = new Date(2026, 11, 28);
  const rows = [{ date: '1/3', isoDate: '2027-01-03' }];
  for (const date of ['這週', '本週', '1/2', '1月2日', '2027-01-02']) assert.equal(resolveWeek(date, [week], rows, now).week.id, 42);
  assert.equal(resolveWeek('下週', [week], rows, now).week, undefined);
  assert.equal(resolveWeek('下下週', [week], rows, now).week, undefined);
  assert.equal(resolveWeek('1/2', [week], rows, now).weekend, rows[0]);
});
test('節目解析保持 slot ID 與角色，歧義時列出節目', () => {
  assert.equal(resolvePart(week, '主席').slotId, 'mw42_chairman');
  assert.equal(resolvePart(week, '4').slotId, 'mw42_t0_0');
  assert.equal(resolvePart(week, '示範', '助手').slotId, 'mw42_m0_1');
  assert.throws(() => resolvePart(week, '示範'), /請指定角色/);
  assert.throws(() => resolvePart(week, ''), /不明確/);
});
test('權限過濾及呼叫時再次檢查', async () => {
  const lit = { name: 'lit', inputSchema: {}, handler: async () => ({ summary: '', data: {} }) };
  const tools = [lit, ...scheduleTools];
  const req = (method, params = {}) => ({ jsonrpc: '2.0', id: 1, method, params });
  const list = async (user) => (await dispatch(req('tools/list'), { user }, tools)).result.tools.map((t) => t.name);
  assert.deepEqual(await list({ role: 'VIEWER', canLiterature: true }), ['lit']);
  assert.ok((await list({ role: 'ADMIN' })).includes('assign_midweek'));
  assert.ok(!(await list({ role: 'ADMIN' })).includes('lit'));
  assert.equal((await dispatch(req('tools/call', { name: 'assign_midweek' }), { user: { role: 'VIEWER' } }, tools)).result.isError, true);
});
test('修改指派使用既有寫入與變更紀錄，資格不足需強制', async () => {
  const db = makeFakeDb({ weeks: [week], people: [], congregations: [{ id: 1 }] });
  const person = { id: 1, name: '王小明', status: 'active', tags: [], gender: 'M' };
  db.congregation.findUnique = async () => ({ people: [person], weeks: [{ ...week, assignments: [] }], weekendRows: [] });
  const ctx = { db, congregationId: 1, user: { role: 'ADMIN', congregationId: 1, displayName: '管理員' } };
  const invoke = async (force) => (await dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
    name: 'assign_midweek', arguments: { date: '2027-01-02', part: '4', person: '王小明', force },
  } }, ctx, scheduleTools)).result;
  assert.equal((await invoke(false)).isError, true);
  assert.equal((await invoke(true)).isError, undefined);
  assert.equal(db.__stores.assignments[0].slotId, 'mw42_t0_0');
  assert.equal(db.__stores.changeLogs[0].actorName, '管理員');
});
test('訂閱輸出含 VEVENT', async () => {
  const date = new Date();
  const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const w = { ...week, isoDate, assignments: [{ slotId: 'mw42_t0_0', name: '王小明' }] };
  const feed = { id: 1, congregationId: 1, person: { name: '王小明', congregationId: 1 }, congregation: { code: 'x' } };
  const db = { calendarFeed: { findUnique: async () => feed, update: async () => {} },
    midweekWeek: { findMany: async () => [w] }, weekendRow: { findMany: async () => [] } };
  const response = await calendarResponse(db, 'secret.ics');
  assert.match(await response.text(), /BEGIN:VEVENT/);
});

test('推薦先標示目前已排人員，並說明候選人從未擔任', async () => {
  const people = [
    { name: '目前人員', status: 'active', tags: ['經文朗讀'], gender: 'M' },
    { name: '新候選人', status: 'active', tags: ['經文朗讀'], gender: 'M' },
  ];
  const scheduled = { ...week, assignments: [{ slotId: 'mw42_t0_0', name: '目前人員' }] };
  const db = { congregation: { findUnique: async () => ({ people, weeks: [scheduled], weekendRows: [] }) } };
  const request = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {
    name: 'suggest_assignee', arguments: { date: '2027-01-02', part: '4' },
  } };
  const response = (await dispatch(request, { db, congregationId: 1, user: { role: 'ADMIN' } }, scheduleTools)).result;
  const lines = response.content[0].text.split('\n');
  assert.match(lines[0], /^目前人員（目前已排）/);
  assert.doesNotMatch(lines[0], /從未擔任/);
  assert.match(lines[1], /^新候選人：從未擔任/);
  assert.equal(response.structuredContent.data.candidates[0].current, true);
});
