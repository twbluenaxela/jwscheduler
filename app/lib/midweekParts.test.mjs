import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPartDeletion, planCompression, recomputeSectionTimes, planInsertAtStart } from './midweekParts.mjs';

function fixtureWeek() {
  const part = (id, partKey, section, partNum, title, dur, time) => ({
    id, partKey, section, partNum, title, dur, time, cat: section, roleLabel: null,
  });
  return {
    id: 1210,
    date: '12/10',
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
});

test('planPartDeletion: 刪除前段節目時，後面所有區段都重新編號，只有同區段時間往前移', () => {
  const plan = planPartDeletion(fixtureWeek(), 't0');
  const byKey = new Map(plan.updates.map((item) => [item.partKey, item]));

  assert.equal(byKey.has('t0'), false);
  assert.equal(byKey.get('t1').partNum, 1);
  assert.equal(byKey.get('m0').partNum, 3);
  assert.equal(byKey.get('cbs').partNum, 9);
  // Same-section parts shift back; cross-section parts keep their time.
  assert.equal(byKey.get('t1').time, '7:36');
  assert.equal(byKey.get('t2').time, '7:46');
  assert.equal(byKey.get('m0').time, '8:00');
  assert.equal(byKey.get('cbs').time, '8:58');
  assert.equal(plan.closingTime, undefined);
});

test('planPartDeletion: 刪除區段最後一個節目不改變任何時間', () => {
  const plan = planPartDeletion(fixtureWeek(), 't2');
  const byKey = new Map(plan.updates.map((item) => [item.partKey, item]));

  assert.equal(byKey.has('t2'), false);
  assert.equal(byKey.get('m0').partNum, 3);
  assert.equal(byKey.get('cbs').partNum, 9);
  // No same-section part follows t2, so nothing gets a new time and closing
  // times stay untouched.
  for (const item of plan.updates) {
    const original = fixtureWeek().parts.find((p) => p.partKey === item.partKey);
    assert.equal(item.time, original.time, item.partKey);
  }
  assert.equal(plan.closingTime, undefined);
  assert.equal(plan.closeSongTime, undefined);
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
