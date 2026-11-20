import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  planPartDeletion, planCompression, recomputeSectionTimes, planInsertAtStart,
  planCascade, timeSourceOptions, buildRestorePayload, retimeClientWeek, canEditMidweekSection, shortPartTitle,
} from './midweekParts.mjs';

function fixtureWeek() {
  const part = (id, partKey, section, partNum, title, dur, time) => ({
    id, partKey, section, partNum, title, dur, time, cat: section, roleLabel: null,
  });
  return {
    id: 1210,
    date: '12/10',
    midSongTime: '8:12',
    closingTime: '9:28',
    closeSongTime: '9:31',
    parts: [
      part(1, 't0', 'treasures', 1, '勇敢傳道別害怕！', '10 分鐘', '7:36'),
      part(2, 't1', 'treasures', 2, '經文寶石', '10 分鐘', '7:46'),
      part(3, 't2', 'treasures', 3, '經文朗讀', '4 分鐘', '7:56'),
      part(4, 'm0', 'ministry', 4, '初次交談', '3 分鐘', '8:00'),
      part(5, 'm1', 'ministry', 5, '初次交談', '4 分鐘', '8:03'),
      part(6, 'm2', 'ministry', 6, '教導人成為門徒', '5 分鐘', '8:07'),
      part(7, 'l0', 'living', 7, '本地需要', '15 分鐘', '8:18'),
      part(8, 'x_demo', 'living', 8, '年度服務報告', '15 分鐘', '8:33'),
      part(9, 'l1', 'living', 9, '基督教徒的生活', '10 分鐘', '8:48'),
      part(10, 'cbs', 'living', 10, '會眾研經班', '30 分鐘', '8:58'),
    ],
  };
}

test('planPartDeletion: 刪除中間的 living 節目，後續 living 時間往前移、其他區段重新編號並調整結語時間', () => {
  const plan = planPartDeletion(fixtureWeek(), 'x_demo');
  const byKey = new Map(plan.updates.map((item) => [item.partKey, item]));

  // x_demo (partNum 8) is gone; every later part renumbers down by one.
  assert.equal(byKey.has('x_demo'), false);
  assert.equal(byKey.get('l1').partNum, 8);
  assert.equal(byKey.get('cbs').partNum, 9);
  assert.equal(byKey.get('cbs').id, 10);

  // Times walk from the deleted part's 8:33: l1 takes 8:33 and advances by
  // its own 10 min, so cbs takes 8:43 instead of 8:58.
  assert.equal(byKey.get('l1').time, '8:33');
  assert.equal(byKey.get('cbs').time, '8:43');
  // Earlier sections are before the removed partNum, so they are untouched.
  assert.equal(byKey.has('m2'), false);

  // Cursor after cbs is 9:13, 15 min before the old closing 9:28.
  assert.equal(plan.closingTime, '9:13');
  assert.equal(plan.closeSongTime, '9:16');
  // Living is the last section: 中場唱詩 is before it and never moves.
  assert.equal(plan.midSongTime, undefined);
});

test('planPartDeletion: 刪除 treasures 節目時，後面所有區段重新編號並往前移，中場唱詩與結語也往前移', () => {
  const plan = planPartDeletion(fixtureWeek(), 't0');
  const byKey = new Map(plan.updates.map((item) => [item.partKey, item]));

  assert.equal(byKey.has('t0'), false);
  assert.equal(byKey.get('t1').partNum, 1);
  assert.equal(byKey.get('m0').partNum, 3);
  assert.equal(byKey.get('cbs').partNum, 9);
  // Treasures end moves from 8:00 to 7:50 (−10), so everything later shifts −10.
  assert.equal(byKey.get('t1').time, '7:36');
  assert.equal(byKey.get('t2').time, '7:46');
  assert.equal(byKey.get('m0').time, '7:50');
  assert.equal(byKey.get('m2').time, '7:57');
  assert.equal(byKey.get('l0').time, '8:08');
  assert.equal(byKey.get('cbs').time, '8:48');
  assert.equal(plan.midSongTime, '8:02');
  assert.equal(plan.closingTime, '9:18');
  assert.equal(plan.closeSongTime, '9:21');
});

test('planPartDeletion: 刪除區段最後一個節目時同區段不變，但後面區段仍整體前移', () => {
  const plan = planPartDeletion(fixtureWeek(), 't2');
  const byKey = new Map(plan.updates.map((item) => [item.partKey, item]));

  assert.equal(byKey.has('t2'), false);
  assert.equal(byKey.get('m0').partNum, 3);
  assert.equal(byKey.get('cbs').partNum, 9);
  // No same-section part follows t2, but the section end still moved −4 min.
  assert.equal(byKey.get('m0').time, '7:56');
  assert.equal(byKey.get('cbs').time, '8:54');
  assert.equal(plan.midSongTime, '8:08');
  assert.equal(plan.closingTime, '9:24');
  assert.equal(plan.closeSongTime, '9:27');
});

test('planPartDeletion: 找不到的節目回傳 null', () => {
  assert.equal(planPartDeletion(fixtureWeek(), 'nope'), null);
});

test('planCompression: 15/30 分鐘 + 5 分鐘 → 13/27，剛好補足 5 分鐘且不低於一半', () => {
  const parts = [
    { partKey: 'l0', title: '本地需要', dur: '15 分鐘' },
    { partKey: 'cbs', title: '會眾研經班', dur: '30 分鐘' },
  ];
  const plan = planCompression(parts, 5);
  const byKey = new Map(plan.changes.map((c) => [c.partKey, c]));

  assert.equal(byKey.get('l0').to, 13);
  assert.equal(byKey.get('cbs').to, 27);
  assert.equal(plan.shortfall, 0);
  const reduced = plan.changes.reduce((sum, c) => sum + (c.from - c.to), 0);
  assert.equal(reduced, 5);
  for (const change of plan.changes) {
    assert.ok(change.to >= Math.ceil(change.from / 2), change.partKey);
  }
});

test('planCompression: 需求過大時 shortfall > 0，所有節目都降到底限', () => {
  const parts = [
    { partKey: 'l0', title: '本地需要', dur: '15 分鐘' },
    { partKey: 'cbs', title: '會眾研經班', dur: '30 分鐘' },
  ];
  const plan = planCompression(parts, 1000);
  const byKey = new Map(plan.changes.map((c) => [c.partKey, c]));

  assert.equal(byKey.get('l0').to, 8);
  assert.equal(byKey.get('cbs').to, 15);
  assert.ok(plan.shortfall > 0);
});

test('planCompression: 非數字時長的節目被忽略', () => {
  const parts = [
    { partKey: 'l0', title: '本地需要', dur: '15 分鐘' },
    { partKey: 'song', title: '唱詩', dur: '約 5 分鐘' },
    { partKey: 'cbs', title: '會眾研經班', dur: '30 分鐘' },
  ];
  const plan = planCompression(parts, 5);
  assert.deepEqual(plan.changes.map((c) => c.partKey), ['l0', 'cbs']);
  assert.equal(plan.shortfall, 0);
});

test('recomputeSectionTimes: 從區段起點依 partNum 順序重算全部時間並回傳區段結束時間', () => {
  const parts = [
    { id: 9, partKey: 'cbs', partNum: 3, dur: '27 分鐘' },
    { id: 8, partKey: 'new', partNum: 2, dur: '5 分鐘' },
    { id: 7, partKey: 'l0', partNum: 1, dur: '13 分鐘' },
  ];
  const { updates, end } = recomputeSectionTimes(parts, '8:18');
  assert.deepEqual(updates.map((u) => [u.partKey, u.time, u.dur]), [
    ['l0', '8:18', '13 分鐘'],
    ['new', '8:31', '5 分鐘'],
    ['cbs', '8:36', '27 分鐘'],
  ]);
  assert.equal(end, '9:03');
});

test('planInsertAtStart: 從區段第一個節目取得插入編號與起始時間', () => {
  const week = {
    parts: [
      { id: 1, partKey: 't0', section: 'treasures', partNum: 1, time: '7:36' },
      { id: 4, partKey: 'm0', section: 'ministry', partNum: 4, time: '8:00' },
      { id: 5, partKey: 'm1', section: 'ministry', partNum: 5, time: '8:03' },
    ],
  };
  assert.deepEqual(planInsertAtStart(week, 'ministry'), { partNum: 4, time: '8:00', renumberFrom: 4 });
  assert.equal(planInsertAtStart(week, 'living'), null);
});

test('planCascade: 在 ministry 加 5 分鐘，所有 living 節目、中場唱詩與結語都往後 5 分鐘', () => {
  const cascade = planCascade(fixtureWeek(), { section: 'ministry', delta: 5 });
  const byKey = new Map(cascade.parts.map((item) => [item.partKey, item]));

  assert.equal(byKey.size, 4);
  assert.equal(byKey.get('l0').time, '8:23');
  assert.equal(byKey.get('x_demo').time, '8:38');
  assert.equal(byKey.get('l1').time, '8:53');
  assert.equal(byKey.get('cbs').time, '9:03');
  // Earlier sections (and the ministry section itself) are untouched.
  assert.equal(byKey.has('m0'), false);
  assert.equal(byKey.has('t0'), false);
  assert.equal(cascade.midSongTime, '8:17');
  assert.equal(cascade.closingTime, '9:33');
  assert.equal(cascade.closeSongTime, '9:36');
});

test('planCascade: 區段結束未變（壓縮添加）時不產生任何更新', () => {
  assert.deepEqual(planCascade(fixtureWeek(), { section: 'ministry', delta: 0 }), { parts: [] });
  assert.deepEqual(planCascade(fixtureWeek(), { section: 'ministry', delta: null }), { parts: [] });
});

test('planCascade: 無法解析的時間保持原樣', () => {
  const week = fixtureWeek();
  week.parts.find((part) => part.partKey === 'cbs').time = '';
  week.midSongTime = '';
  const cascade = planCascade(week, { section: 'treasures', delta: 5 });
  assert.equal(cascade.parts.some((item) => item.partKey === 'cbs'), false);
  assert.equal(cascade.midSongTime, undefined);
  assert.equal(cascade.closingTime, '9:33');
});

test('shortPartTitle: 在第一個全形或半形括號前截斷並保留完整標題', () => {
  assert.equal(shortPartTitle('本地需要（訪問：恩德與愛倫夫妻）'), '本地需要');
  assert.equal(shortPartTitle('會眾研經班'), '會眾研經班');
  assert.equal(shortPartTitle('新節目 (示範) 說明'), '新節目');
  assert.equal(shortPartTitle('  本地需要  （說明）'), '本地需要');
  assert.equal(shortPartTitle(), '');
});

test('timeSourceOptions: 平均分攤為預設且包含 cbs，其次依序列出各節目與延後結束', () => {
  const parts = [
    { partKey: 'l0', title: '本地需要', cat: 'living', dur: '15 分鐘', partNum: 7 },
    { partKey: 'cbs', title: '會眾研經班', cat: 'cbs', dur: '30 分鐘', partNum: 10 },
  ];
  const plan = timeSourceOptions(parts, 5);
  assert.equal(plan.defaultKey, 'spread');
  assert.deepEqual(plan.options.map((option) => option.key), ['spread', 'l0', 'cbs', 'later']);
  assert.deepEqual(
    plan.options[0].changes.map((change) => [change.partKey, change.from, change.to]),
    [['l0', 15, 13], ['cbs', 30, 27]],
  );
  assert.deepEqual(plan.options[0].adjust, [
    { partKey: 'l0', dur: '13 分鐘' },
    { partKey: 'cbs', dur: '27 分鐘' },
  ]);
  assert.equal(plan.options[0].shortfall, 0);
  assert.equal(plan.options[1].label, '本地需要 15→10');
  assert.equal(plan.options[2].label, '會眾研經班 30→25');
  assert.deepEqual(plan.options[3].adjust, []);
});

test('timeSourceOptions: 長標題在標籤中使用短名，完整標題另行保留', () => {
  const parts = [
    { partKey: 'l0', title: '本地需要（訪問：恩德與愛倫夫妻）', dur: '15 分鐘', partNum: 7 },
    { partKey: 'cbs', title: '會眾研經班', dur: '30 分鐘', partNum: 9 },
  ];
  const plan = timeSourceOptions(parts, 5);
  assert.equal(plan.options[1].label, '本地需要 15→10');
  assert.equal(plan.options[1].fullTitle, '本地需要（訪問：恩德與愛倫夫妻）');
  assert.deepEqual(
    plan.options[0].changes.map((change) => [change.title, change.fullTitle]),
    [['本地需要', '本地需要（訪問：恩德與愛倫夫妻）'], ['會眾研經班', '會眾研經班']],
  );
});

test('timeSourceOptions: 只有會眾研經班時也能分攤或單獨扣時間', () => {
  const parts = [{ partKey: 'cbs', title: '會眾研經班', cat: 'cbs', dur: '30 分鐘', partNum: 9 }];
  const plan = timeSourceOptions(parts, 5);
  assert.deepEqual(plan.options.map((option) => option.key), ['spread', 'cbs', 'later']);
  assert.deepEqual(plan.options[0].changes.map((change) => [change.partKey, change.from, change.to]), [['cbs', 30, 25]]);
  assert.equal(plan.options[1].label, '會眾研經班 30→25');
});

test('timeSourceOptions: 需求過大時平均分攤回報 shortfall，且沒有單一節目選項', () => {
  const parts = [
    { partKey: 'l0', title: '本地需要', cat: 'living', dur: '15 分鐘', partNum: 7 },
    { partKey: 'cbs', title: '會眾研經班', cat: 'cbs', dur: '30 分鐘', partNum: 10 },
  ];
  const plan = timeSourceOptions(parts, 100);
  assert.deepEqual(plan.options.map((option) => option.key), ['spread', 'later']);
  assert.equal(plan.options[0].shortfall, 78);
  assert.deepEqual(plan.options[0].changes.map((change) => [change.partKey, change.from, change.to]), [['l0', 15, 8], ['cbs', 30, 15]]);
});

test('canEditMidweekSection: 只有基督徒的生活可以新增或刪除', () => {
  assert.equal(canEditMidweekSection('living'), true);
  assert.equal(canEditMidweekSection('treasures'), false);
  assert.equal(canEditMidweekSection('ministry'), false);
  assert.equal(canEditMidweekSection(''), false);
});

function clientWeek() {
  return {
    treasures: [
      { id: 't0', partNum: 1, time: '7:36', dur: '10 分鐘' },
      { id: 't1', partNum: 2, time: '7:46', dur: '10 分鐘' },
    ],
    ministry: [
      { id: 'm0', partNum: 3, time: '8:00', dur: '3 分鐘' },
      { id: 'm1', partNum: 4, time: '8:03', dur: '4 分鐘' },
    ],
    living: [
      { id: 'l0', partNum: 5, time: '8:18', dur: '15 分鐘' },
      { id: 'cbs', partNum: 6, time: '8:33', dur: '30 分鐘' },
    ],
    midSongTime: '8:12',
    closingTime: '9:03',
    closeSongTime: '9:06',
  };
}

test('retimeClientWeek: 改 treasures 時長會往後推移同區段、後面區段與所有共用時間', () => {
  const next = retimeClientWeek(clientWeek(), { section: 'treasures', partNum: 1, delta: 5 });
  assert.equal(next.treasures[1].time, '7:51');
  assert.equal(next.ministry[0].time, '8:05');
  assert.equal(next.ministry[1].time, '8:08');
  assert.equal(next.midSongTime, '8:17');
  assert.equal(next.living[0].time, '8:23');
  assert.equal(next.living[1].time, '8:38');
  assert.equal(next.closingTime, '9:08');
  assert.equal(next.closeSongTime, '9:11');
  // The edited part itself is not moved, and the original week is untouched.
  assert.equal(next.treasures[0].time, '7:36');
  assert.equal(clientWeek().closingTime, '9:03');
});

test('retimeClientWeek: 改 living 節目只推後面節目與結語，不移中場唱詩', () => {
  const next = retimeClientWeek(clientWeek(), { section: 'living', partNum: 5, delta: -2 });
  assert.equal(next.living[1].time, '8:31');
  assert.equal(next.midSongTime, '8:12');
  assert.equal(next.closingTime, '9:01');
  assert.equal(next.closeSongTime, '9:04');
  assert.equal(next.ministry[0].time, '8:00');
});

test('retimeClientWeek: delta 0 與無法解析的時間不產生變更', () => {
  const week = clientWeek();
  assert.equal(retimeClientWeek(week, { section: 'living', partNum: 5, delta: 0 }), week);
  week.living[1].time = '';
  week.closingTime = '';
  const next = retimeClientWeek(week, { section: 'living', partNum: 5, delta: 3 });
  assert.equal(next.living[1].time, '');
  assert.equal(next.closingTime, '');
  assert.equal(next.closeSongTime, '9:09');
});

test('buildRestorePayload: 組出 delete undo 所需的 POST payload', () => {
  const week = fixtureWeek();
  const deleted = week.parts.find((part) => part.partKey === 'x_demo');
  deleted.scenario = '示範情境';
  deleted.hideHelper = true;
  const assignments = [
    { slotId: 'mw1210_x_demo_1', name: '助手' },
    { slotId: 'mw1210_x_demo_0', name: '主講' },
  ];

  assert.deepEqual(buildRestorePayload(week, 'x_demo', assignments), {
    section: 'living',
    afterPartKey: 'l0',
    title: '年度服務報告',
    dur: '15 分鐘',
    time: '8:33',
    cat: 'living',
    roleLabel: null,
    scenario: '示範情境',
    hideHelper: true,
    assignments: [
      { index: 0, name: '主講' },
      { index: 1, name: '助手' },
    ],
  });

  // First part of a section inserts at start; missing part has no payload.
  assert.equal(buildRestorePayload(week, 't0', []).afterPartKey, null);
  assert.equal(buildRestorePayload(week, 'nope', []), null);
  // Callers may also pass assignments with an explicit index.
  assert.deepEqual(
    buildRestorePayload(week, 'x_demo', [{ index: 1, name: 'A' }]).assignments,
    [{ index: 1, name: 'A' }],
  );
});
