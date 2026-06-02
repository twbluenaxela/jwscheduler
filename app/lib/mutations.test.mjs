import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyMidweekAssignment, applyWeekendPatch } from './mutations.mjs';
import { makeFakeDb } from './test-support/fake-db.mjs';

const user = { congregationId: 1, displayName: '管理員' };

function seed(extra = {}) {
  return {
    weeks: [{
      id: 1, congregationId: 1, date: '6月 3日',
      parts: [{ partKey: 'm1', title: '初次交談', roleLabel: '學生/助手', cbsRef: '' }],
    }],
    weekendRows: [{ id: 5, congregationId: 1, sortOrder: 0, date: '6/8', type: 'schedule', speaker: '', chair: '李小華' }],
    assignments: [],
    ...extra,
  };
}

// ── Midweek assignment + change log ────────────────────────────────────────────

test('指派主席：寫入 assignment 並記錄一筆 assign 變更', async () => {
  const db = makeFakeDb(seed());
  const res = await applyMidweekAssignment(db, user, 'mw1_chairman', '王大明');

  assert.equal(res.status, 200);
  assert.equal(db.__stores.assignments.find((a) => a.slotId === 'mw1_chairman').name, '王大明');
  assert.equal(db.__stores.changeLogs.length, 1);
  const log = db.__stores.changeLogs[0];
  assert.equal(log.action, 'assign');
  assert.equal(log.label, '主席');
  assert.equal(log.date, '6月 3日');
  assert.equal(log.name, '王大明');
  assert.equal(log.prevName, null);
  assert.equal(log.actorName, '管理員');
});

test('改派同一槽位：記錄 reassign 並保留前任', async () => {
  const db = makeFakeDb(seed({ assignments: [{ slotId: 'mw1_chairman', weekId: 1, name: '王大明' }] }));
  await applyMidweekAssignment(db, user, 'mw1_chairman', '李小華');
  const log = db.__stores.changeLogs.at(-1);
  assert.equal(log.action, 'reassign');
  assert.equal(log.prevName, '王大明');
  assert.equal(log.name, '李小華');
});

test('清除槽位：刪除 assignment 並記錄 clear（name=null）', async () => {
  const db = makeFakeDb(seed({ assignments: [{ slotId: 'mw1_chairman', weekId: 1, name: '王大明' }] }));
  await applyMidweekAssignment(db, user, 'mw1_chairman', '');
  assert.equal(db.__stores.assignments.find((a) => a.slotId === 'mw1_chairman'), undefined);
  const log = db.__stores.changeLogs.at(-1);
  assert.equal(log.action, 'clear');
  assert.equal(log.name, null);
  assert.equal(log.prevName, '王大明');
});

test('指派相同名字：無變更，不寫入記錄', async () => {
  const db = makeFakeDb(seed({ assignments: [{ slotId: 'mw1_chairman', weekId: 1, name: '王大明' }] }));
  await applyMidweekAssignment(db, user, 'mw1_chairman', '王大明');
  assert.equal(db.__stores.changeLogs.length, 0);
});

test('助手槽位記錄正確角色標籤', async () => {
  const db = makeFakeDb(seed());
  await applyMidweekAssignment(db, user, 'mw1_m1_1', '助手乙');
  assert.equal(db.__stores.changeLogs.at(-1).label, '初次交談（助手）');
});

test('未知週次回傳 403 且不寫入記錄', async () => {
  const db = makeFakeDb(seed());
  const res = await applyMidweekAssignment(db, user, 'mw999_chairman', '王大明');
  assert.equal(res.status, 403);
  assert.equal(db.__stores.changeLogs.length, 0);
});

test('格式錯誤的 slotId 回傳 400', async () => {
  const db = makeFakeDb(seed());
  assert.equal((await applyMidweekAssignment(db, user, 'garbage', '王大明')).status, 400);
});

// ── Weekend patch + change log ─────────────────────────────────────────────────

test('週末講者更新：記錄 we{id}_speaker、label 公眾演講', async () => {
  const db = makeFakeDb(seed());
  const existing = { ...db.__stores.weekendRows[0] };
  const res = await applyWeekendPatch(db, user, existing, { speaker: '陳志明' });

  assert.equal(res.status, 200);
  assert.equal(db.__stores.weekendRows[0].speaker, '陳志明');
  const log = db.__stores.changeLogs.at(-1);
  assert.equal(log.slotId, 'we5_speaker');
  assert.equal(log.label, '公眾演講');
  assert.equal(log.action, 'assign');
  assert.equal(log.date, '6/8');
});

test('週末改派主席：保留前任名字', async () => {
  const db = makeFakeDb(seed());
  const existing = { ...db.__stores.weekendRows[0] }; // chair 李小華
  await applyWeekendPatch(db, user, existing, { chair: '王大明' });
  const log = db.__stores.changeLogs.at(-1);
  assert.equal(log.label, '主席');
  assert.equal(log.prevName, '李小華');
  assert.equal(log.name, '王大明');
  assert.equal(log.action, 'reassign');
});

test('週末非姓名欄位（topic）不寫入變更記錄', async () => {
  const db = makeFakeDb(seed());
  const existing = { ...db.__stores.weekendRows[0] };
  await applyWeekendPatch(db, user, existing, { topic: '新主題' });
  assert.equal(db.__stores.changeLogs.length, 0);
  assert.equal(db.__stores.weekendRows[0].topic, '新主題');
});

test('週末沒有可更新欄位回傳 400', async () => {
  const db = makeFakeDb(seed());
  const existing = { ...db.__stores.weekendRows[0] };
  assert.equal((await applyWeekendPatch(db, user, existing, { bogus: 'x' })).status, 400);
});
