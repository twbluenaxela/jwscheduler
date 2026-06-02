import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMessage, handleFollow, HELP_LINKED, HELP_UNLINKED } from './line-webhook.mjs';
import { makeFakeDb } from './test-support/fake-db.mjs';

const NOW = new Date(2026, 5, 2); // 2 June 2026, so "6月 3日" is in the future

function replySpy() {
  const replies = [];
  return { replies, reply: async (token, text) => { replies.push({ token, text }); } };
}

const msg = (userId, text) => ({ replyToken: 'tok', source: { userId }, message: { type: 'text', text } });

const baseSeed = {
  congregations: [{ id: 1, name: '新屋會眾', code: 'xinwu' }],
  people: [{ id: 7, congregationId: 1, name: '王大明', status: 'active', lineUserId: 'U-wang' }],
  weeks: [{ id: 1, congregationId: 1, date: '6月 3日', parts: [] }],
  assignments: [{ slotId: 'mw1_chairman', weekId: 1, name: '王大明' }],
  weekendRows: [{ id: 5, congregationId: 1, sortOrder: 0, date: '6/8', type: 'schedule', speaker: '王大明' }],
  pendingLinks: [],
};

// ── The reverted individual-query feature still works ──────────────────────────

test('我的安排：已連結者收到含其安排的回覆', async () => {
  const db = makeFakeDb(baseSeed);
  const { replies, reply } = replySpy();
  await handleMessage(msg('U-wang', '我的安排'), { db, reply, now: NOW });
  assert.equal(replies.length, 1);
  assert.match(replies[0].text, /王大明，你目前的安排（共 2 項）/);
  assert.match(replies[0].text, /6月 3日\s+主席/);
  assert.match(replies[0].text, /6\/8\s+公眾演講/);
});

test('我的安排：別名「節目查詢」也觸發查詢', async () => {
  const db = makeFakeDb(baseSeed);
  const { replies, reply } = replySpy();
  await handleMessage(msg('U-wang', '節目查詢'), { db, reply, now: NOW });
  assert.match(replies[0].text, /你目前的安排/);
});

test('我的安排：沒有安排時回覆提示', async () => {
  const db = makeFakeDb({ ...baseSeed, assignments: [], weekendRows: [] });
  const { replies, reply } = replySpy();
  await handleMessage(msg('U-wang', '我的安排'), { db, reply, now: NOW });
  assert.match(replies[0].text, /目前你沒有排定的安排/);
});

test('暫停的週末列不出現在個別查詢中', async () => {
  const db = makeFakeDb({
    ...baseSeed,
    assignments: [],
    weekendRows: [{ id: 5, congregationId: 1, sortOrder: 0, date: '6/8', type: 'suspended', speaker: '王大明' }],
  });
  const { replies, reply } = replySpy();
  await handleMessage(msg('U-wang', '我的安排'), { db, reply, now: NOW });
  assert.match(replies[0].text, /目前你沒有排定的安排/);
});

test('說明：已連結者收到指令清單', async () => {
  const db = makeFakeDb(baseSeed);
  const { replies, reply } = replySpy();
  await handleMessage(msg('U-wang', '說明'), { db, reply, now: NOW });
  assert.equal(replies[0].text, HELP_LINKED);
});

test('已連結但非指令：回覆連結狀態與可用指令', async () => {
  const db = makeFakeDb(baseSeed);
  const { replies, reply } = replySpy();
  await handleMessage(msg('U-wang', '哈囉'), { db, reply, now: NOW });
  assert.match(replies[0].text, /你已連結為「王大明」（新屋會眾）/);
});

// ── Two-step registration flow ────────────────────────────────────────────────

test('註冊：未連結者傳會眾名稱 → 建立 pending 並詢問姓名', async () => {
  const db = makeFakeDb({ congregations: baseSeed.congregations, people: [], weeks: [], assignments: [], weekendRows: [], pendingLinks: [] });
  const { replies, reply } = replySpy();
  await handleMessage(msg('U-new', '新屋'), { db, reply, now: NOW });
  assert.equal(db.__stores.pendingLinks.length, 1);
  assert.equal(db.__stores.pendingLinks[0].congregationId, 1);
  assert.match(replies[0].text, /已選擇「新屋會眾」/);
  assert.match(replies[0].text, /請回覆你在排班表上的姓名/);
});

test('註冊：pending 中傳姓名 → 連結 lineUserId 並清除 pending', async () => {
  const db = makeFakeDb({
    congregations: baseSeed.congregations,
    people: [{ id: 9, congregationId: 1, name: '李小華', status: 'active', lineUserId: null }],
    pendingLinks: [{ lineUserId: 'U-new', congregationId: 1 }],
    weeks: [], assignments: [], weekendRows: [],
  });
  const { replies, reply } = replySpy();
  await handleMessage(msg('U-new', '李小華'), { db, reply, now: NOW });
  assert.equal(db.__stores.people.find((p) => p.id === 9).lineUserId, 'U-new');
  assert.equal(db.__stores.pendingLinks.length, 0);
  assert.match(replies[0].text, /連結成功/);
});

test('註冊：未知會眾名稱回覆找不到', async () => {
  const db = makeFakeDb({ congregations: baseSeed.congregations, people: [], weeks: [], assignments: [], weekendRows: [], pendingLinks: [] });
  const { replies, reply } = replySpy();
  await handleMessage(msg('U-new', '不存在的會眾'), { db, reply, now: NOW });
  assert.match(replies[0].text, /找不到「不存在的會眾」/);
  assert.equal(db.__stores.pendingLinks.length, 0);
});

test('未連結者傳「說明」收到註冊指示', async () => {
  const db = makeFakeDb({ congregations: baseSeed.congregations, people: [], weeks: [], assignments: [], weekendRows: [], pendingLinks: [] });
  const { replies, reply } = replySpy();
  await handleMessage(msg('U-new', '說明'), { db, reply, now: NOW });
  assert.equal(replies[0].text, HELP_UNLINKED);
});

test('follow 事件詢問會眾名稱', async () => {
  const { replies, reply } = replySpy();
  await handleFollow({ replyToken: 'tok' }, { reply });
  assert.match(replies[0].text, /請先回覆你所屬的會眾名稱/);
});
