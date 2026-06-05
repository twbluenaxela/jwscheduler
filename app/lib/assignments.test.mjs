import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCnDate, collectAssignments, itemKey } from './assignments.mjs';

// Deterministic clock: pretend "today" is 2 June 2026.
const NOW = new Date(2026, 5, 2);
const TODAY = new Date(2026, 5, 2, 0, 0, 0, 0);
// Webhook query behaviour skips suspended weekend rows.
const webhookOpts = { now: NOW, today: TODAY, skipSuspended: true };
// Publish behaviour keeps them (original behaviour, unchanged).
const publishOpts = { now: NOW, today: TODAY };

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
  { id: 11, date: '6/15', type: 'suspended', speaker: '王大明' }, // suspended
  { id: 12, date: '6/1', type: 'event', label: '特別聚會' }, // event — always excluded
];

const rolesFor = (name, opts) => collectAssignments(name, weeks, weekendRows, opts).map((i) => i.role);

// ── Individual query (the LINE 我的安排 path) ──────────────────────────────────

test('個別查詢：未來安排排序、排除過去/事項列、暫停列（skipSuspended）', () => {
  const items = collectAssignments('王大明', weeks, weekendRows, webhookOpts);
  assert.deepEqual(items, [
    { date: '6月 3日', role: '主席' },
    { date: '6月 3日', role: '寶藏演講' },
    { date: '6/8', role: '公眾演講' },
  ]);
});

test('個別查詢：角色標籤與研經班教材參照', () => {
  assert.deepEqual(rolesFor('學生甲', webhookOpts), ['初次交談（學生）']);
  assert.deepEqual(rolesFor('助手乙', webhookOpts), ['初次交談（助手）']);
  assert.deepEqual(rolesFor('主持丙', webhookOpts), ['會眾研經班（利未記 第1-7章）（主持）']);
  assert.deepEqual(rolesFor('朗讀丁', webhookOpts), ['會眾研經班（利未記 第1-7章）（朗讀）']);
});

test('個別查詢：沒有未來安排回傳空陣列', () => {
  assert.deepEqual(collectAssignments('查無此人', weeks, weekendRows, webhookOpts), []);
});

test('發佈行為（預設）保留暫停列，個別查詢（skipSuspended）排除', () => {
  // Publish keeps suspended rows → 王大明 also gets the 6/15 公眾演講.
  assert.ok(rolesFor('王大明', publishOpts).includes('公眾演講'));
  const sixFifteen = collectAssignments('王大明', weeks, weekendRows, publishOpts)
    .filter((i) => i.date === '6/15');
  assert.equal(sixFifteen.length, 1);
  // Webhook query drops it.
  const sixFifteenWebhook = collectAssignments('王大明', weeks, weekendRows, webhookOpts)
    .filter((i) => i.date === '6/15');
  assert.equal(sixFifteenWebhook.length, 0);
});

test('itemKey 組合日期與角色', () => {
  assert.equal(itemKey({ date: '6月 3日', role: '主席' }), '6月 3日|主席');
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

// ── Cross-year boundary (Dec 2026 → Jan 2027 workbook) ───────────────────────

// Simulate: user imports a workbook covering 2026/12 and 2027/1.
// "today" is mid-December 2026; weeks span the year boundary.

const DEC_NOW   = new Date(2026, 11, 15);          // 15 Dec 2026
const DEC_TODAY = new Date(2026, 11, 15, 0, 0, 0); // same, midnight

const crossYearWeeks = [
  {
    id: 10,
    date: '12月 22日',
    parts: [{ partKey: 't0', title: '寶藏演講', roleLabel: '', cbsRef: '' }],
    assignments: [
      { slotId: 'mw10_chairman', name: '王大明' },
      { slotId: 'mw10_t0_0', name: '王大明' },
    ],
  },
  {
    id: 11,
    date: '12月 29日',
    parts: [],
    assignments: [{ slotId: 'mw11_chairman', name: '李小華' }],
  },
  {
    id: 12,
    date: '1月 5日',   // 2027 — must be inferred correctly when now=Dec 2026
    parts: [],
    assignments: [{ slotId: 'mw12_chairman', name: '王大明' }],
  },
  {
    id: 13,
    date: '1月 12日',  // 2027
    parts: [],
    assignments: [{ slotId: 'mw13_chairman', name: '王大明' }],
  },
];

test('parseCnDate 跨年：12月中旬查看時，1月日期歸屬 2027', () => {
  const jan5  = parseCnDate('1月 5日',  DEC_NOW);
  const dec22 = parseCnDate('12月 22日', DEC_NOW);

  assert.equal(jan5.getFullYear(),  2027, '1月 → 2027');
  assert.equal(dec22.getFullYear(), 2026, '12月 → 2026');
  assert.ok(jan5 > dec22, '1月 2027 應晚於 12月 2026');
});

test('parseCnDate 跨年：斜線格式 1/5 在 12月也歸屬 2027', () => {
  const jan5slash = parseCnDate('1/5', DEC_NOW);
  assert.equal(jan5slash.getFullYear(), 2027);
  assert.equal(jan5slash.getMonth(),    0);
  assert.equal(jan5slash.getDate(),     5);
});

test('parseCnDate 跨年：1月上旬查看時，12月日期歸屬 2026', () => {
  const JAN_NOW = new Date(2027, 0, 5); // 5 Jan 2027
  const dec29 = parseCnDate('12月 29日', JAN_NOW);
  assert.equal(dec29.getFullYear(), 2026, '12月 → 2026 when now is Jan 2027');
});

test('collectAssignments 跨年：12月與1月安排均包含且排序正確', () => {
  const items = collectAssignments('王大明', crossYearWeeks, [], { now: DEC_NOW, today: DEC_TODAY });
  // Should include Dec 22, Jan 5, Jan 12 — all future relative to Dec 15.
  const dates = items.map(i => i.date);
  assert.ok(dates.includes('12月 22日'), '應包含 12月 22日');
  assert.ok(dates.includes('1月 5日'),   '應包含 1月 5日');
  assert.ok(dates.includes('1月 12日'),  '應包含 1月 12日');

  // Dec 22 must come before Jan 5.
  const idx22 = dates.indexOf('12月 22日');
  const idx5  = dates.indexOf('1月 5日');
  assert.ok(idx22 < idx5, '12月 22日 應排在 1月 5日 之前');
});

test('collectAssignments 跨年：過去的12月安排已排除', () => {
  // Dec 29 is in the future but Dec 22 is 7 days after the 15th and is
  // in the future (>= today Dec 15).  To test exclusion, use Dec 30 as today.
  const DEC30 = new Date(2026, 11, 30, 0, 0, 0);
  const items  = collectAssignments('王大明', crossYearWeeks, [], { now: DEC_NOW, today: DEC30 });
  const dates  = items.map(i => i.date);
  assert.ok(!dates.includes('12月 22日'), '12月 22日 應已排除（過去）');
  assert.ok(dates.includes('1月 5日'),    '1月 5日 應仍包含（未來）');
});

test('collectAssignments 跨年：元旦後查看時，12月安排已全部排除', () => {
  const JAN_NOW   = new Date(2027, 0, 5);
  const JAN_TODAY = new Date(2027, 0, 5, 0, 0, 0);
  const items = collectAssignments('王大明', crossYearWeeks, [], { now: JAN_NOW, today: JAN_TODAY });
  const dates = items.map(i => i.date);
  assert.ok(!dates.includes('12月 22日'), '12月週次應已排除');
  assert.ok(!dates.includes('12月 29日'), '12月週次應已排除');
  assert.ok(dates.includes('1月 5日'),    '1月 5日 應仍包含（當天）');
  assert.ok(dates.includes('1月 12日'),   '1月 12日 應仍包含');
});

// ── Wiring checks (behaviour is covered in line-webhook.test.mjs) ───────────────

test('LINE webhook 路由委派給共用 handler', () => {
  const src = readFileSync(new URL('../api/line/webhook/route.js', import.meta.url), 'utf8');
  assert.ok(src.includes("from '../../../lib/line-webhook.mjs'"), '應從 line-webhook 模組匯入 handler');
  assert.ok(src.includes('handleMessage(event, deps)'), '應呼叫 handleMessage');
});

test('發佈通知未改動：LINE-only 快照、無 collectAssignedNames 填充', () => {
  const src = readFileSync(new URL('../api/meetings/publish/route.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('collectAssignedNames'), '不應再填充全體名單到快照');
});
