import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  describeMidweekSlot,
  weekendFieldLabel,
  changeAction,
  logChange,
  WEEKEND_NAME_FIELDS,
} from './changelog.mjs';

// A tiny capturing fake — logChange only needs db.changeLog.create.
function captureDb() {
  const rows = [];
  return { rows, changeLog: { create: async ({ data }) => { rows.push(data); return data; } } };
}

const week = {
  id: 42,
  date: '6月 3日',
  parts: [
    { partKey: 't1', title: '寶藏演講', roleLabel: '', cbsRef: '' },
    { partKey: 'm1', title: '初次交談', roleLabel: '學生/助手', cbsRef: '' },
    { partKey: 'cbs1', title: '會眾研經班', roleLabel: '主持/朗讀', cbsRef: '利未記 第1-7章' },
  ],
};

test('describeMidweekSlot 解析會眾項目槽位', () => {
  assert.deepEqual(describeMidweekSlot(week, 'mw42_chairman'), { date: '6月 3日', label: '主席' });
  assert.deepEqual(describeMidweekSlot(week, 'mw42_openPrayer'), { date: '6月 3日', label: '開始禱告' });
  assert.deepEqual(describeMidweekSlot(week, 'mw42_closePrayer'), { date: '6月 3日', label: '結束禱告' });
});

test('describeMidweekSlot 解析節目槽位的角色標籤與教材參照', () => {
  assert.deepEqual(describeMidweekSlot(week, 'mw42_t1_0'), { date: '6月 3日', label: '寶藏演講' });
  assert.deepEqual(describeMidweekSlot(week, 'mw42_m1_0'), { date: '6月 3日', label: '初次交談（學生）' });
  assert.deepEqual(describeMidweekSlot(week, 'mw42_m1_1'), { date: '6月 3日', label: '初次交談（助手）' });
  assert.deepEqual(describeMidweekSlot(week, 'mw42_cbs1_0'), { date: '6月 3日', label: '會眾研經班（利未記 第1-7章）（主持）' });
  assert.deepEqual(describeMidweekSlot(week, 'mw42_cbs1_1'), { date: '6月 3日', label: '會眾研經班（利未記 第1-7章）（朗讀）' });
});

test('describeMidweekSlot 對不符前綴的槽位回傳 null', () => {
  assert.equal(describeMidweekSlot(week, 'mw99_chairman'), null);
  assert.equal(describeMidweekSlot(null, 'mw42_chairman'), null);
});

test('weekendFieldLabel 對應欄位到角色名稱', () => {
  assert.equal(weekendFieldLabel('speaker'), '公眾演講');
  assert.equal(weekendFieldLabel('chair'), '主席');
  assert.equal(weekendFieldLabel('wt'), '守望台主持');
  assert.equal(weekendFieldLabel('read'), '朗讀');
  assert.equal(weekendFieldLabel('host'), '招待');
  assert.deepEqual(WEEKEND_NAME_FIELDS, ['speaker', 'chair', 'wt', 'read', 'host']);
});

test('changeAction 分類新增/清除/改派/無變更', () => {
  assert.equal(changeAction('', '王大明'), 'assign');
  assert.equal(changeAction('王大明', ''), 'clear');
  assert.equal(changeAction('王大明', '李小華'), 'reassign');
  assert.equal(changeAction('王大明', '王大明'), null);
  assert.equal(changeAction('', ''), null);
});

// ── logChange behaviour ────────────────────────────────────────────────────────

test('logChange 寫入新增記錄（prevName 為 null）', async () => {
  const db = captureDb();
  await logChange(db, { congregationId: 1, slotId: 'mw1_chairman', date: '6月 3日', label: '主席', prevName: '', name: '王大明', actorName: '管理員' });
  assert.equal(db.rows.length, 1);
  assert.deepEqual(db.rows[0], {
    congregationId: 1, slotId: 'mw1_chairman', date: '6月 3日', label: '主席',
    prevName: null, name: '王大明', action: 'assign', actorName: '管理員',
  });
});

test('logChange 改派保留前任、清除時 name 為 null', async () => {
  const reassign = captureDb();
  await logChange(reassign, { congregationId: 1, slotId: 's', date: 'd', label: 'l', prevName: '王大明', name: '李小華' });
  assert.equal(reassign.rows[0].action, 'reassign');
  assert.equal(reassign.rows[0].prevName, '王大明');

  const clear = captureDb();
  await logChange(clear, { congregationId: 1, slotId: 's', date: 'd', label: 'l', prevName: '王大明', name: '' });
  assert.equal(clear.rows[0].action, 'clear');
  assert.equal(clear.rows[0].name, null);
});

test('logChange 對無實質變更不寫入', async () => {
  const db = captureDb();
  await logChange(db, { congregationId: 1, slotId: 's', date: 'd', label: 'l', prevName: '王大明', name: '王大明' });
  await logChange(db, { congregationId: 1, slotId: 's', date: 'd', label: 'l', prevName: '', name: '' });
  assert.equal(db.rows.length, 0);
});

test('logChange 為盡力而為：DB 寫入失敗不丟出例外', async () => {
  const db = { changeLog: { create: async () => { throw new Error('db down'); } } };
  await assert.doesNotReject(
    logChange(db, { congregationId: 1, slotId: 's', date: 'd', label: 'l', prevName: '', name: '王大明' }),
  );
});

// ── Wiring check: the log is surfaced in 總覽 ───────────────────────────────────

test('總覽提供最近變更分頁並讀取 /api/changelog', () => {
  const src = readFileSync(new URL('../components/OverviewPage.js', import.meta.url), 'utf8');
  assert.ok(src.includes('最近變更'), '應有最近變更分頁');
  assert.ok(src.includes('/api/changelog'), '應呼叫 changelog API');
});
