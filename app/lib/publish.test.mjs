import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMessage, buildPublishPlan, applyPublish } from './publish.mjs';
import { collectAssignments } from './assignments.mjs';
import { makeFakeDb } from './test-support/fake-db.mjs';

// Deterministic clock: "today" is 2 June 2026, so every 6月 date used below is
// in the future and every publish diff includes it.
const NOW = new Date(2026, 5, 2);

const header = (name) => `【新屋會眾 · 聚會節目通知】\n${name}，你好！`;
const FIRST = (name, list, count) =>
  `${header(name)}\n\n以下是你目前的安排（共 ${count} 項）：\n\n${list}\n\n如有疑問請聯絡編排負責人。`;
const UPDATE = (name, body) => `${header(name)}\n\n你的安排有更新：\n${body}\n\n如有疑問請聯絡編排負責人。`;

// A week shaped like the DB rows: `parts` carry partKey/title/roleLabel/cbsRef/
// hideHelper/time/section, `assignments` carry slotId/name.
const week = (id, date, isoDate, parts, assignments = []) =>
  ({ id, congregationId: 1, date, isoDate, parts, assignments });

const ministryPart = (extra = {}) =>
  ({ partKey: 'm1', title: '初次交談', roleLabel: '學生/助手', cbsRef: '', hideHelper: false, time: '7:30', section: 'ministry', ...extra });
const cbsPart = (extra = {}) =>
  ({ partKey: 'cbs1', title: '會眾研經班', roleLabel: '主持/朗讀', cbsRef: '利未記 第1-7章', hideHelper: false, time: '8:00', section: 'living', ...extra });

const people = [
  { id: 1, congregationId: 1, name: '學生甲', status: 'active', lineUserId: 'U-student' },
  { id: 2, congregationId: 1, name: '助手乙', status: 'active', lineUserId: 'U-helper' },
  { id: 3, congregationId: 1, name: '主持丙', status: 'active', lineUserId: 'U-chair' },
  { id: 4, congregationId: 1, name: '朗讀丁', status: 'active', lineUserId: 'U-reader' },
];

const baselineWeek = () => week(10, '6月 10日', '2026-06-10', [ministryPart(), cbsPart()], [
  { slotId: 'mw10_m1_0', name: '學生甲' },
  { slotId: 'mw10_m1_1', name: '助手乙' },
  { slotId: 'mw10_cbs1_0', name: '主持丙' },
  { slotId: 'mw10_cbs1_1', name: '朗讀丁' },
]);

// Snapshot as a previous publish would have saved it.
function snapshotOf(weeks, names) {
  const snapshot = {};
  for (const name of names) snapshot[name] = collectAssignments(name, weeks, [], { now: NOW });
  return snapshot;
}

const texts = (messages) => Object.fromEntries(messages.map((m) => [m.name, m.text]));

// ── a) Baseline: first publish sends the full upcoming list ───────────────────

test('a) 第一次發布：完整未來安排、角色標籤、研經班教材', () => {
  const plan = buildPublishPlan({ weeks: [baselineWeek()], people, snapshot: null, now: NOW });

  assert.deepEqual(texts(plan.messages), {
    學生甲: FIRST('學生甲', '▸ 6月 10日  初次交談（學生）', 1),
    助手乙: FIRST('助手乙', '▸ 6月 10日  初次交談（助手）', 1),
    主持丙: FIRST('主持丙', '▸ 6月 10日  會眾研經班（利未記 第1-7章）（主持）', 1),
    朗讀丁: FIRST('朗讀丁', '▸ 6月 10日  會眾研經班（利未記 第1-7章）（朗讀）', 1),
  });
});

test('a) 第一次發布：沒有安排的人不發訊息', () => {
  const plan = buildPublishPlan({ weeks: [], people, snapshot: null, now: NOW });
  assert.deepEqual(plan.messages, []);
});

// ── b) Added part (x_<uuid>, roleLabel null) ─────────────────────────────────

test('b) 新增節目：負責人收到一則 ✚，其他人不收到', () => {
  const before = [baselineWeek()];
  const after = [
    baselineWeek(),
    week(11, '6月 17日', '2026-06-17', [
      { partKey: 'x_abc', title: '特別演講', roleLabel: null, cbsRef: '', hideHelper: false, time: '8:26', section: 'living' },
    ], [{ slotId: 'mw11_x_abc_0', name: '學生甲' }]),
  ];

  const plan = buildPublishPlan({
    weeks: after,
    people,
    snapshot: snapshotOf(before, people.map((p) => p.name)),
    now: NOW,
  });

  assert.equal(plan.messages.length, 1);
  assert.equal(plan.messages[0].name, '學生甲');
  assert.equal(plan.messages[0].text, UPDATE('學生甲', '\n新增：\n  ✚ 6月 17日  特別演講'));
});

// ── c) Deleted part (incl. cbs) ──────────────────────────────────────────────

test('c) 刪除節目：負責人收到該節目的 ✖', () => {
  const before = [
    baselineWeek(),
    week(11, '6月 17日', '2026-06-17', [
      { partKey: 'x_del', title: '特別演講', roleLabel: null, cbsRef: '', hideHelper: false, time: '8:26', section: 'living' },
    ], [{ slotId: 'mw11_x_del_0', name: '學生甲' }]),
  ];
  const after = [baselineWeek()];

  const plan = buildPublishPlan({
    weeks: after,
    people,
    snapshot: snapshotOf(before, people.map((p) => p.name)),
    now: NOW,
  });

  assert.deepEqual(texts(plan.messages), {
    學生甲: UPDATE('學生甲', '\n取消：\n  ✖ 6月 17日  特別演講'),
  });
});

test('c) 刪除會眾研經班：主持與朗讀各自收到正確標籤的 ✖', () => {
  const before = [baselineWeek()];
  const after = [week(10, '6月 10日', '2026-06-10', [ministryPart()], [
    { slotId: 'mw10_m1_0', name: '學生甲' },
    { slotId: 'mw10_m1_1', name: '助手乙' },
  ])];

  const plan = buildPublishPlan({
    weeks: after,
    people,
    snapshot: snapshotOf(before, people.map((p) => p.name)),
    now: NOW,
  });

  assert.deepEqual(texts(plan.messages), {
    主持丙: UPDATE('主持丙', '\n取消：\n  ✖ 6月 10日  會眾研經班（利未記 第1-7章）（主持）'),
    朗讀丁: UPDATE('朗讀丁', '\n取消：\n  ✖ 6月 10日  會眾研經班（利未記 第1-7章）（朗讀）'),
  });
});

// ── d) Delete then undo: new partKey, same title / names → net zero ──────────

test('d) 刪除後復原（新的 partKey、同名同角色）：不發任何訊息', () => {
  const before = [
    baselineWeek(),
    week(11, '6月 17日', '2026-06-17', [
      { partKey: 'x_old', title: '年度報告', roleLabel: null, cbsRef: '', hideHelper: false, time: '8:26', section: 'living' },
    ], [{ slotId: 'mw11_x_old_0', name: '學生甲' }]),
  ];
  const after = [
    baselineWeek(),
    week(11, '6月 17日', '2026-06-17', [
      { partKey: 'x_new', title: '年度報告', roleLabel: null, cbsRef: '', hideHelper: false, time: '8:26', section: 'living' },
    ], [{ slotId: 'mw11_x_new_0', name: '學生甲' }]),
  ];

  const plan = buildPublishPlan({
    weeks: after,
    people,
    snapshot: snapshotOf(before, people.map((p) => p.name)),
    now: NOW,
  });

  assert.deepEqual(plan.messages, []);
});

// ── e) Time cascade only ──────────────────────────────────────────────────────

test('e) 時間連動（後續節目時間與結語改變）：不發任何訊息', () => {
  const before = [week(11, '6月 17日', '2026-06-17', [
    { partKey: 'l1', title: '本地需要', roleLabel: null, cbsRef: '', hideHelper: false, time: '8:26', section: 'living' },
    { partKey: 'l2', title: '總結', roleLabel: null, cbsRef: '', hideHelper: false, time: '8:41', section: 'living' },
  ], [
    { slotId: 'mw11_l1_0', name: '學生甲' },
    { slotId: 'mw11_l2_0', name: '助手乙' },
  ])];
  before[0].closingTime = '9:00';
  const after = [week(11, '6月 17日', '2026-06-17', [
    { partKey: 'l1', title: '本地需要', roleLabel: null, cbsRef: '', hideHelper: false, time: '8:31', section: 'living' },
    { partKey: 'l2', title: '總結', roleLabel: null, cbsRef: '', hideHelper: false, time: '8:46', section: 'living' },
  ], [
    { slotId: 'mw11_l1_0', name: '學生甲' },
    { slotId: 'mw11_l2_0', name: '助手乙' },
  ])];
  after[0].closingTime = '9:05';

  const plan = buildPublishPlan({
    weeks: after,
    people,
    snapshot: snapshotOf(before, people.map((p) => p.name)),
    now: NOW,
  });

  assert.deepEqual(plan.messages, []);
});

// ── f) Title edit of an assigned part ────────────────────────────────────────

const titleEditWeeks = (title) => [week(11, '6月 17日', '2026-06-17', [
  { partKey: 'l1', title, roleLabel: null, cbsRef: '', hideHelper: false, time: '8:26', section: 'living' },
], [{ slotId: 'mw11_l1_0', name: '學生甲' }])];

test('f) 標題修改：同一 slotId 用一則 ✎（原：舊角色）', () => {
  const before = titleEditWeeks('本地需要');
  const after = titleEditWeeks('本地需要（訪問：王大明）');

  const plan = buildPublishPlan({
    weeks: after,
    people,
    snapshot: snapshotOf(before, people.map((p) => p.name)),
    now: NOW,
  });

  assert.deepEqual(texts(plan.messages), {
    學生甲: UPDATE('學生甲', '\n修改：\n  ✎ 6月 17日  本地需要（訪問：王大明）（原：本地需要）'),
  });
});

test('f) 舊格式快照（無 slotId）仍以 ✖ + ✚ 呈現', () => {
  const before = titleEditWeeks('本地需要');
  const after = titleEditWeeks('本地需要（訪問：王大明）');
  const snapshot = snapshotOf(before, people.map((p) => p.name));
  // Pre-slotId snapshots have no slotId on their items.
  for (const name of Object.keys(snapshot)) {
    snapshot[name] = snapshot[name].map(({ slotId, ...rest }) => rest);
  }

  const plan = buildPublishPlan({ weeks: after, people, snapshot, now: NOW });

  assert.deepEqual(texts(plan.messages), {
    學生甲: UPDATE('學生甲', '\n新增：\n  ✚ 6月 17日  本地需要（訪問：王大明）\n\n取消：\n  ✖ 6月 17日  本地需要'),
  });
});

test('f) buildMessage：新舊兩側都有 slotId 才配對改名', () => {
  const oldItem = { date: '6月 17日', role: '本地需要', slotId: 'mw11_l1_0' };
  const newItem = { date: '6月 17日', role: '本地需要（訪問：王大明）', slotId: 'mw11_l1_0' };

  // Same slot, different partKey in slotId (undo) still matches only by slotId.
  assert.match(buildMessage('學生甲', [newItem], [oldItem], { now: NOW }), /✎ 6月 17日/);
  // No slotId on the old item → fall back.
  assert.match(buildMessage('學生甲', [newItem], [{ ...oldItem, slotId: undefined }], { now: NOW }), /✖ 6月 17日/);
});

// ── g) Helper slot removed / hidden ──────────────────────────────────────────

test('g) 助手移除（學生/助手 → 學生，_1 清除）：助手收到 ✖ 助手', () => {
  const before = [baselineWeek()];
  const after = [week(10, '6月 10日', '2026-06-10', [ministryPart({ roleLabel: '學生' }), cbsPart()], [
    { slotId: 'mw10_m1_0', name: '學生甲' },
    { slotId: 'mw10_cbs1_0', name: '主持丙' },
    { slotId: 'mw10_cbs1_1', name: '朗讀丁' },
  ])];

  const plan = buildPublishPlan({
    weeks: after,
    people,
    snapshot: snapshotOf(before, people.map((p) => p.name)),
    now: NOW,
  });

  assert.deepEqual(texts(plan.messages), {
    助手乙: UPDATE('助手乙', '\n取消：\n  ✖ 6月 10日  初次交談（助手）'),
  });
});

test('g) hideHelper=true 的陳舊 _1 指派：不列入、不通知', () => {
  // The stale _1 row is still in the DB from before the toggle.
  const weeks = [week(10, '6月 10日', '2026-06-10', [ministryPart(), cbsPart({ hideHelper: true })], [
    { slotId: 'mw10_m1_0', name: '學生甲' },
    { slotId: 'mw10_m1_1', name: '助手乙' },
    { slotId: 'mw10_cbs1_0', name: '主持丙' },
    { slotId: 'mw10_cbs1_1', name: '朗讀丁' },
  ])];

  assert.deepEqual(collectAssignments('朗讀丁', weeks, [], { now: NOW }), []);
  // A snapshot saved while the helper was already hidden has no entry for them.
  const plan = buildPublishPlan({
    weeks,
    people: people.filter((p) => p.id !== 4),
    snapshot: snapshotOf(weeks, people.filter((p) => p.id !== 4).map((p) => p.name)),
    now: NOW,
  });
  assert.deepEqual(plan.messages, []);
  // They are not LINE-linked in this plan, so they get no snapshot entry at all;
  // the hidden slot is never listed anywhere.
  assert.equal(plan.nextSnapshot['朗讀丁'], undefined, '隱藏的助手槽不得列出');
  assert.deepEqual(plan.nextSnapshot['主持丙'], [
    { date: '6月 10日', role: '會眾研經班（利未記 第1-7章）（主持）', slotId: 'mw10_cbs1_0' },
  ]);
});

// ── h) Multiple roles, same person, same week ────────────────────────────────

test('h) 同一人同週多項安排：兩行都出現且依日期排序', () => {
  const weeks = [
    week(10, '6月 10日', '2026-06-10', [ministryPart()], [
      { slotId: 'mw10_chairman', name: '王大明' },
      { slotId: 'mw10_m1_0', name: '王大明' },
    ]),
    week(11, '6月 17日', '2026-06-17', [ministryPart({ partKey: 'm2', title: '續訪' })], [
      { slotId: 'mw11_m2_0', name: '王大明' },
    ]),
  ];
  const plan = buildPublishPlan({
    weeks,
    people: [{ id: 9, congregationId: 1, name: '王大明', status: 'active', lineUserId: 'U-wang' }],
    // Present but empty = a real previous baseline ("you had nothing").
    snapshot: { 王大明: [] },
    now: NOW,
  });

  assert.deepEqual(texts(plan.messages), {
    王大明: UPDATE('王大明', '\n新增：\n  ✚ 6月 10日  主席\n  ✚ 6月 10日  初次交談（學生）\n  ✚ 6月 17日  續訪（學生）'),
  });
});

// ── i) Person without a LINE link ────────────────────────────────────────────

test('i) 未連結 LINE 的人：不推播，快照也不包含他（與 main 行為一致）', () => {
  const linked = [{ id: 1, congregationId: 1, name: '學生甲', status: 'active', lineUserId: 'U-student' }];
  const weeks = [week(10, '6月 10日', '2026-06-10', [ministryPart()], [
    { slotId: 'mw10_m1_0', name: '學生甲' },
    { slotId: 'mw10_m1_1', name: '未連結者' },
  ])];

  const plan = buildPublishPlan({ weeks, people: linked, snapshot: null, now: NOW });

  assert.deepEqual(plan.messages.map((m) => m.name), ['學生甲']);
  // Only LINE-linked active people are in the snapshot — no padding for names
  // that cannot have received a message. This is why a later link gets a full list.
  assert.deepEqual(Object.keys(plan.nextSnapshot), ['學生甲']);
  assert.equal(plan.nextSnapshot['未連結者'], undefined);
});

test('i) 發布後才連結 LINE 的人：下一次發布收到完整安排（不是空的 diff）', () => {
  const weeks = [week(10, '6月 10日', '2026-06-10', [ministryPart()], [
    { slotId: 'mw10_m1_0', name: '學生甲' },
    { slotId: 'mw10_m1_1', name: '後來連結者' },
  ])];

  // First publish: 後來連結者 has no lineUserId, so they are not in `people`.
  const firstPeople = [{ id: 1, congregationId: 1, name: '學生甲', status: 'active', lineUserId: 'U-student' }];
  const first = buildPublishPlan({ weeks, people: firstPeople, snapshot: null, now: NOW });
  assert.equal(first.nextSnapshot['後來連結者'], undefined, '未連結者不寫入快照');

  // They link LINE before the next publish.
  const secondPeople = [
    ...firstPeople,
    { id: 2, congregationId: 1, name: '後來連結者', status: 'active', lineUserId: 'U-later' },
  ];
  const second = buildPublishPlan({ weeks, people: secondPeople, snapshot: first.nextSnapshot, now: NOW });

  const byName = texts(second.messages);
  assert.deepEqual(Object.keys(byName), ['後來連結者'], '既有成員沒有變動，不發訊息');
  assert.equal(
    byName['後來連結者'],
    FIRST('後來連結者', '▸ 6月 10日  初次交談（助手）', 1),
    '新連結者第一次發布收到完整清單，而不是與空快照的差異',
  );
});

test('i) 發布後才連結的人：若中間有指派變動，仍以完整清單呈現（不是差異）', () => {
  const before = [week(10, '6月 10日', '2026-06-10', [ministryPart()], [
    { slotId: 'mw10_m1_1', name: '後來連結者' },
  ])];
  const after = [week(10, '6月 10日', '2026-06-10', [ministryPart()], [
    { slotId: 'mw10_m1_0', name: '學生甲' },
    { slotId: 'mw10_m1_1', name: '後來連結者' },
  ])];

  const first = buildPublishPlan({
    weeks: before,
    people: [{ id: 1, congregationId: 1, name: '學生甲', status: 'active', lineUserId: 'U-student' }],
    snapshot: null,
    now: NOW,
  });
  const second = buildPublishPlan({
    weeks: after,
    people: [
      { id: 1, congregationId: 1, name: '學生甲', status: 'active', lineUserId: 'U-student' },
      { id: 2, congregationId: 1, name: '後來連結者', status: 'active', lineUserId: 'U-later' },
    ],
    snapshot: first.nextSnapshot,
    now: NOW,
  });

  assert.equal(
    texts(second.messages)['後來連結者'],
    FIRST('後來連結者', '▸ 6月 10日  初次交談（助手）', 1),
  );
});

// ── applyPublish: fake DB + push spy ─────────────────────────────────────────

function seedDb({ snapshot = null, people: seedPeople = people, weeks = [baselineWeek()], calendarFeeds = [] } = {}) {
  return makeFakeDb({
    congregations: [{ id: 1, name: '新屋會眾', code: 'xinwu', publishedSnapshot: snapshot }],
    people: seedPeople,
    weeks,
    assignments: weeks.flatMap((w) => w.assignments.map((a) => ({ ...a, weekId: w.id }))),
    calendarFeeds,
  });
}

test('applyPublish：送出、計數並儲存 LINE 成員快照（不含未連結者）', async () => {
  const weeks = [week(10, '6月 10日', '2026-06-10', [ministryPart()], [
    { slotId: 'mw10_m1_0', name: '學生甲' },
    { slotId: 'mw10_m1_1', name: '未連結者' },
  ])];
  const db = seedDb({
    people: [people[0]],
    weeks,
    calendarFeeds: [{ personId: 1, congregationId: 1, token: 'tok', lastFetchedAt: new Date() }],
  });
  const pushed = [];
  const result = await applyPublish(db, { congregationId: 1, displayName: '管理員' }, {
    push: async (lineUserId, text) => { pushed.push({ lineUserId, text }); return { ok: true }; },
    now: NOW,
  });

  assert.deepEqual(result, { sent: 1, failed: 0, skipped: 0, total: 1, errors: [] });
  assert.deepEqual(pushed, [{ lineUserId: 'U-student', text: FIRST('學生甲', '▸ 6月 10日  初次交談（學生）', 1) }]);
  const saved = db.__stores.congregations[0].publishedSnapshot;
  assert.deepEqual(Object.keys(saved), ['學生甲'], '未連結者的名字不寫入快照');
  assert.equal(saved['未連結者'], undefined);
});

test('applyPublish：未訂閱行事曆的人收到 📅 提示；已訂閱的人不會', async () => {
  const weeks = [week(10, '6月 10日', '2026-06-10', [ministryPart()], [
    { slotId: 'mw10_m1_0', name: '學生甲' },
    { slotId: 'mw10_m1_1', name: '助手乙' },
  ])];
  const db = seedDb({
    people: people.slice(0, 2),
    weeks,
    calendarFeeds: [{ personId: 1, congregationId: 1, token: 'tok', lastFetchedAt: new Date() }],
  });
  const pushed = [];
  await applyPublish(db, { congregationId: 1 }, {
    push: async (lineUserId, text) => { pushed.push({ lineUserId, text }); return { ok: true }; },
    now: NOW,
  });

  const byUser = Object.fromEntries(pushed.map((p) => [p.lineUserId, p.text]));
  assert.equal(byUser['U-student'], FIRST('學生甲', '▸ 6月 10日  初次交談（學生）', 1));
  assert.equal(byUser['U-helper'], `${FIRST('助手乙', '▸ 6月 10日  初次交談（助手）', 1)}\n\n📅 想讓安排自動出現在手機行事曆？回覆「行事曆」就可以。`);
});

test('applyPublish：推播失敗計入 failed 且仍儲存快照', async () => {
  const db = seedDb({
    people: [people[0]],
    calendarFeeds: [{ personId: 1, congregationId: 1, token: 'tok', lastFetchedAt: new Date() }],
  });
  const result = await applyPublish(db, { congregationId: 1 }, {
    push: async () => ({ ok: false, error: 'boom' }),
    now: NOW,
  });

  assert.equal(result.sent, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.errors, ['學生甲: boom']);
  assert.ok(db.__stores.congregations[0].publishedSnapshot['學生甲']);
});

test('applyPublish：發布保留暫停的週末列（與原行為一致）', async () => {
  const db = makeFakeDb({
    congregations: [{ id: 1, name: '新屋會眾', code: 'xinwu', publishedSnapshot: null }],
    people: [{ id: 1, congregationId: 1, name: '王大明', status: 'active', lineUserId: 'U-wang' }],
    weeks: [],
    weekendRows: [{ id: 5, congregationId: 1, sortOrder: 0, date: '6/15', isoDate: '2026-06-15', type: 'suspended', speaker: '王大明' }],
    calendarFeeds: [{ personId: 1, congregationId: 1, token: 'tok', lastFetchedAt: new Date() }],
  });
  const pushed = [];
  await applyPublish(db, { congregationId: 1 }, {
    push: async (lineUserId, text) => { pushed.push(text); return { ok: true }; },
    now: NOW,
  });

  assert.equal(pushed.length, 1);
  assert.match(pushed[0], /6\/15  公眾演講/);
});

// ── Wiring guard ─────────────────────────────────────────────────────────────

test('publish 路由委派給 framework-free core', () => {
  const src = readFileSync(new URL('../api/meetings/publish/route.js', import.meta.url), 'utf8');
  assert.ok(src.includes("from '../../../lib/publish.mjs'"), '應從 publish.mjs 匯入');
  assert.ok(src.includes('applyPublish(db, user, { push: pushLine })'), '應呼叫 applyPublish');
});
