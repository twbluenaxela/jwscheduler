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
    midweekWeek: { findMany: async () => [w] }, weekendRow: { findMany: async () => [] },
    serviceCategory: { findMany: async () => [] }, serviceAssignment: { findMany: async () => [] }, fieldServiceMeeting: { findMany: async () => [] } };
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

test('個人與服務工具合併安排、顯示月表及修改服務', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  const month = today.slice(0, 7);
  const person = { id: 7, name: '王小明', congregationId: 1, serviceGroup: 'A' };
  const categories = [
    { id: 1, key: 'microphone', name: '麥克風服務', kind: 'slots', positions: ['左邊', '右邊'] },
    { id: 2, key: 'cleaning', name: '打掃', kind: 'groups', positions: ['小組'] },
    { id: 3, key: 'field', name: '帶頭傳道', kind: 'field', positions: [] },
  ];
  const meeting = { ...week, isoDate: today, weekdayPill: '星期三 · 19:30', assignments: [{ slotId: 'mw42_t0_0', name: person.name }] };
  const assignments = [{ categoryId: 1, date: today, position: '左邊', personId: 7, person: { name: person.name } }, { categoryId: 2, date: `${month}-01`, position: '小組', text: 'A' }];
  const field = [{ date: today, time: '09:00', place: '公園', leaderId: 7, leader: { name: person.name }, territory: '第一区' }];
  let written;
  const db = {
    congregation: { findUnique: async () => ({ people: [person], weeks: [meeting], weekendRows: [] }) },
    serviceCategory: { findMany: async () => categories },
    serviceAssignment: { findMany: async () => assignments, upsert: async args => { written = args; }, deleteMany: async args => { written = args; } },
    fieldServiceMeeting: { findMany: async () => field },
    calendarFeed: { upsert: async () => ({ token: 'token' }) },
  };
  const ctx = { db, congregationId: 1, user: { role: 'ADMIN', displayName: ' 王小明 ' }, origin: 'https://example.org' };
  const call = async (name, args = {}, context = ctx) => (await dispatch({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, context, scheduleTools)).result;
  const mine = await call('get_my_assignments');
  assert.match(mine.content[0].text, /經文朗讀/);
  assert.match(mine.content[0].text, /麥克風服務（左邊）/);
  assert.match(mine.content[0].text, /帶頭傳道 · 公園/);
  assert.match(mine.content[0].text, /https:\/\/example.org\/cal\/token/);
  assert.match((await call('get_person_assignments', { person: '王小明' })).content[0].text, /聚會後打掃/);
  const schedule = await call('get_service_schedule', { month });
  assert.match(schedule.content[0].text, /左邊 → 王小明/);
  assert.match(schedule.content[0].text, /打掃\n.*A/);
  assert.match(schedule.content[0].text, /公園｜帶領：王小明｜地區：第一区/);
  assert.match((await call('get_service_schedule', { month, category: 'field' })).content[0].text, /帶頭傳道/);
  await call('set_service_assignment', { category: 'microphone', date: today, position: '右邊', person: '王小明' });
  assert.equal(written.create.personId, 7);
  await call('set_service_assignment', { category: 'microphone', date: today, position: '右邊', person: '' });
  assert.equal(written.where.position, '右邊');
  assert.equal((await call('set_service_assignment', { category: 'field', date: today, position: '', person: '' })).isError, true);
  assert.match((await call('get_my_assignments', {}, { ...ctx, user: { role: 'ADMIN', displayName: '未知' } })).content[0].text, /請問您是哪一位/);
  assert.equal((await call('set_service_assignment', {}, { ...ctx, user: { role: 'VIEWER' } })).isError, true);
});
