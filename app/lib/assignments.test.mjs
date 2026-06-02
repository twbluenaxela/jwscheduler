import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCnDate,
  collectAssignments,
  collectAssignedNames,
  diffChanges,
  buildChangesText,
} from './assignments.mjs';

// Deterministic clock: pretend "today" is 2 June 2026.
const NOW = new Date(2026, 5, 2);
const TODAY = new Date(2026, 5, 2, 0, 0, 0, 0);
const opts = { now: NOW, today: TODAY };

const weeks = [
  {
    id: 1,
    date: '6月 3日', // future
    parts: [
      { partKey: 't1', title: '寶藏演講', roleLabel: '', cbsRef: '' },
      { partKey: 'm1', title: '初次交談', roleLabel: '學生/助手', cbsRef: '' },
      { partKey: 'cbs1', title: '會眾研經班', roleLabel: '主持/朗讀', cbsRef: '利未記 第1-7章' },
    ],
    assignments: [
      { slotId: 'mw1_chairman', name: '王大明' },
      { slotId: 'mw1_openPrayer', name: '李小華' },
      { slotId: 'mw1_t1_0', name: '王大明' },
      { slotId: 'mw1_m1_0', name: '學生甲' },
      { slotId: 'mw1_m1_1', name: '助手乙' },
      { slotId: 'mw1_cbs1_0', name: '主持丙' },
      { slotId: 'mw1_cbs1_1', name: '朗讀丁' },
    ],
  },
  {
    id: 2,
    date: '5月 1日', // past — must be excluded
    parts: [],
    assignments: [{ slotId: 'mw2_chairman', name: '王大明' }],
  },
];

const weekendRows = [
  { id: 10, date: '6/8', type: 'schedule', speaker: '王大明', chair: '李小華', wt: '', read: '', host: '' },
  { id: 11, date: '6/15', type: 'suspended', speaker: '停止弟兄' }, // suspended — excluded
  { id: 12, date: '6/1', type: 'event', label: '特別聚會' }, // event — excluded
];

const rolesFor = (name) => collectAssignments(name, weeks, weekendRows, opts).map((i) => i.role);

// ── Individual query (the LINE 我的安排 path) ──────────────────────────────────

test('個別查詢：收集某人的未來安排，排除過去/暫停/事項列，依日期排序', () => {
  const items = collectAssignments('王大明', weeks, weekendRows, opts);
  assert.deepEqual(items, [
    { date: '6月 3日', role: '主席' },
    { date: '6月 3日', role: '寶藏演講' },
    { date: '6/8', role: '公眾演講' },
  ]);
});

test('個別查詢：角色標籤與研經班教材參照', () => {
  assert.deepEqual(rolesFor('學生甲'), ['初次交談（學生）']);
  assert.deepEqual(rolesFor('助手乙'), ['初次交談（助手）']);
  assert.deepEqual(rolesFor('主持丙'), ['會眾研經班（利未記 第1-7章）（主持）']);
  assert.deepEqual(rolesFor('朗讀丁'), ['會眾研經班（利未記 第1-7章）（朗讀）']);
});

test('個別查詢：沒有未來安排回傳空陣列', () => {
  assert.deepEqual(collectAssignments('查無此人', weeks, weekendRows, opts), []);
});

// ── Snapshot name coverage ────────────────────────────────────────────────────

test('collectAssignedNames 涵蓋所有被指派者，排除暫停/事項列', () => {
  const names = collectAssignedNames(weeks, weekendRows);
  for (const n of ['王大明', '李小華', '學生甲', '助手乙', '主持丙', '朗讀丁']) {
    assert.ok(names.has(n), `應包含 ${n}`);
  }
  assert.ok(!names.has('停止弟兄'), '暫停列上的人不應計入');
});

// ── Group-wide changes diff ───────────────────────────────────────────────────

test('群組變更：與上次快照比對，產生新增/取消', () => {
  const prevSnapshot = {
    王大明: [
      { date: '6月 3日', role: '主席' },     // unchanged
      { date: '6月 3日', role: '結束禱告' }, // removed (no longer assigned)
    ],
  };
  const { added, removed } = diffChanges(prevSnapshot, weeks, weekendRows, opts);

  const wang = added.filter((i) => i.name === '王大明').map((i) => i.role);
  assert.deepEqual(wang, ['寶藏演講', '公眾演講']); // 主席 unchanged → not added

  assert.deepEqual(
    removed.filter((i) => i.name === '王大明'),
    [{ date: '6月 3日', role: '結束禱告', name: '王大明' }],
  );
});

test('群組變更：首次發布（無快照）時全部視為新增、沒有取消', () => {
  const { added, removed } = diffChanges(null, weeks, weekendRows, opts);
  assert.equal(removed.length, 0);
  assert.ok(added.some((i) => i.name === '王大明' && i.role === '主席'));
  assert.ok(added.some((i) => i.name === '主持丙'));
});

test('群組變更：無變更時 added/removed 皆為空', () => {
  // Snapshot exactly equals current for the only relevant person.
  const snapshot = {};
  for (const name of collectAssignedNames(weeks, weekendRows)) {
    snapshot[name] = collectAssignments(name, weeks, weekendRows, opts);
  }
  const { added, removed } = diffChanges(snapshot, weeks, weekendRows, opts);
  assert.equal(added.length, 0);
  assert.equal(removed.length, 0);
});

test('buildChangesText 格式包含標題、新增、取消區段', () => {
  const text = buildChangesText(
    [{ date: '6月 3日', role: '主席', name: '王大明' }],
    [{ date: '6月 10日', role: '朗讀', name: '陳志明' }],
  );
  assert.ok(text.startsWith('【聚會節目更新】'));
  assert.ok(text.includes('新增：'));
  assert.ok(text.includes('✚ 6月 3日  主席 — 王大明'));
  assert.ok(text.includes('取消：'));
  assert.ok(text.includes('✖ 6月 10日  朗讀 — 陳志明'));
});

// ── Date parsing ──────────────────────────────────────────────────────────────

test('parseCnDate 解析中文與斜線格式並處理跨年', () => {
  const cn = parseCnDate('6月 3日', NOW);
  assert.equal(cn.getMonth(), 5);
  assert.equal(cn.getDate(), 3);

  const slash = parseCnDate('8/9', NOW);
  assert.equal(slash.getMonth(), 7);
  assert.equal(slash.getDate(), 9);

  // In December, "1月" belongs to next year.
  const dec = parseCnDate('1月 5日', new Date(2026, 11, 15));
  assert.equal(dec.getFullYear(), 2027);
});

// ── Wiring checks (the group-wide option is exposed; webhook query still wired) ─

test('匯出選單提供「複製更新文字」並呼叫 /api/meetings/changes', () => {
  const src = readFileSync(new URL('../components/MeetingsPage.js', import.meta.url), 'utf8');
  assert.ok(src.includes("action: 'changes'"), '應有 changes 匯出動作');
  assert.ok(src.includes('/api/meetings/changes'), '應呼叫 changes API');
  assert.ok(src.includes('複製更新文字'), '應有選單標籤');
});

test('LINE webhook 仍支援個別查詢並使用共用 collectAssignments', () => {
  const src = readFileSync(new URL('../api/line/webhook/route.js', import.meta.url), 'utf8');
  assert.ok(src.includes('我的安排'), '應保留我的安排指令');
  assert.ok(src.includes("from '../../../lib/assignments.mjs'"), '應從共用模組匯入');
  assert.ok(src.includes('collectAssignments(linked.name'), '查詢時應呼叫 collectAssignments');
});
