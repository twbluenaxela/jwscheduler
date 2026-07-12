import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestMidweekWeek, suggestWeekendRow } from './suggest.js';

// Assigning for a meeting on 7/1/2026.
const REF = new Date(2026, 6, 1);
const emptyWeek = { id: 1, treasures: [], ministry: [], living: [] };

const brother = (name, quals) => ({ name, g: 'M', quals, status: 'active' });

test('suggests a 傳道與生活主席-qualified brother for chairman (not legacy 主席)', () => {
  // Regression: after the 主席 split migration, members carry 傳道與生活主席, not 主席.
  // The old engine filtered by 主席 and suggested nobody.
  const people = [brother('甲', ['傳道與生活主席'])];
  const res = suggestMidweekWeek(people, emptyWeek, {}, [], REF);
  assert.equal(res['mw1_chairman'], '甲');
});

test('weekend chair uses 週末聚會主席 and wt uses 守望台主持人 (split tags)', () => {
  const people = [
    brother('講者', ['公眾演講']),
    brother('主席甲', ['週末聚會主席']),
    brother('守望甲', ['守望台主持人']),
    brother('朗讀甲', ['守望台朗讀']),
  ];
  const res = suggestWeekendRow(people, [], {}, REF);
  assert.equal(res.speaker, '講者');
  assert.equal(res.chair, '主席甲');
  assert.equal(res.wt, '守望甲');
  assert.equal(res.read, '朗讀甲');
});

test('prefers the never-served candidate (longest gap) for chairman', () => {
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const history = [{ name: '甲', cat: 'chairman', date: '6月 3日' }]; // 甲 served, 乙 never
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '乙');
});

test('ignores assignments dated on/after refDate (past-only)', () => {
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const history = [
    { name: '甲', cat: 'chairman', date: '8月 1日' }, // after 7/1 → excluded → 甲 never-served
    { name: '乙', cat: 'chairman', date: '6月 3日' }, // before 7/1 → 乙 daysSince 28
  ];
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '甲', 'future assignment must not count against 甲');
});

test('daysSince measured from refDate: earlier server preferred over recent server', () => {
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const history = [
    { name: '甲', cat: 'chairman', date: '6月 24日' }, // 7 days before ref
    { name: '乙', cat: 'chairman', date: '5月 6日' },  // 56 days before ref
  ];
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '乙', 'longest gap before refDate wins');
});

test('midweek part suggestion fills treasures slot from section array', () => {
  const week = {
    id: 2,
    treasures: [{ id: 't0', cat: 'treasures', roleLabel: '' }],
    ministry: [],
    living: [],
  };
  const people = [brother('楊家松', ['寶藏演講'])];
  const res = suggestMidweekWeek(people, week, {}, [], REF);
  assert.equal(res['mw2_t0_0'], '楊家松');
});

test('does not suggest for already-filled slots', () => {
  const people = [brother('甲', ['傳道與生活主席'])];
  const res = suggestMidweekWeek(people, emptyWeek, { 'mw1_chairman': '已指派' }, [], REF);
  assert.equal(res['mw1_chairman'], undefined);
});

// ── Ministry talk (演講) gender restriction ──────────────────────────────────

const sister = (name, quals) => ({ name, g: 'F', quals, status: 'active' });

test('ministry 演講 parts only suggest brothers with 傳道演講 (not the mixed demo pool)', () => {
  const week = {
    id: 3,
    treasures: [],
    ministry: [{ id: 'm2', cat: 'ministry', roleLabel: '學生', title: '解釋自己的信仰 — 演講' }],
    living: [],
  };
  const people = [
    sister('姊妹甲', ['傳道示範', '助手']),
    brother('弟兄甲', ['傳道演講']),
  ];
  const res = suggestMidweekWeek(people, week, {}, [], REF);
  assert.equal(res['mw3_m2_0'], '弟兄甲', '演講 must go to a 傳道演講 brother');
});

test('ministry demo parts still use the mixed 傳道示範 pool', () => {
  const week = {
    id: 3,
    treasures: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談 — 向住戶作見證' }],
    living: [],
  };
  const people = [sister('姊妹甲', ['傳道示範']), sister('姊妹乙', ['傳道示範'])];
  const res = suggestMidweekWeek(people, week, {}, [], REF);
  assert.equal(res['mw3_m0_0'], '姊妹甲');
  assert.equal(res['mw3_m0_1'], '姊妹乙');
});

// ── Part-type rotation ────────────────────────────────────────────────────────

test('rotates part types: recent 初次交談 student yields the slot to someone who has not done it', () => {
  const week = {
    id: 4,
    treasures: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談 — 向住戶作見證' }],
    living: [],
  };
  const people = [sister('甲', ['傳道示範']), sister('乙', ['傳道示範'])];
  // 甲 has the LONGER overall gap (would win on pure fairness) but did 初次交談 as
  // 學生 before; 乙 only ever did 再次交談 → rotation gives 乙 the 初次交談 學生 slot.
  const history = [
    { name: '甲', cat: 'ministry', date: '6月 10日', type: '初次交談', role: '0' },
    { name: '乙', cat: 'ministry', date: '6月 17日', type: '再次交談', role: '0' },
  ];
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw4_m0_0'], '乙', 'never-done-this-type wins within the rotation window');
});

test('rotates roles: perpetual 助手 gets the 學生 slot over a recent 學生', () => {
  const week = {
    id: 4,
    treasures: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談 — 向住戶作見證' }],
    living: [],
  };
  const people = [sister('甲', ['傳道示範']), sister('乙', ['傳道示範'])];
  const history = [
    { name: '甲', cat: 'ministry', date: '6月 10日', type: '初次交談', role: '0' },
    { name: '乙', cat: 'ministry', date: '6月 17日', type: '初次交談', role: '1' },
  ];
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw4_m0_0'], '乙', '乙 has never been 學生 for this type');
  assert.equal(res['mw4_m0_1'], '甲');
});

test('helper slot prefers the same gender as the student (S-38)', () => {
  const week = {
    id: 5,
    treasures: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談 — 向住戶作見證' }],
    living: [],
  };
  // Brother 乙 has the longest gap, but the student is a sister → helper should be 丙 (sister).
  const people = [
    sister('姊妹甲', ['傳道示範']),
    brother('弟兄乙', ['傳道示範']),
    sister('姊妹丙', ['傳道示範']),
  ];
  const history = [
    { name: '姊妹丙', cat: 'ministry', date: '6月 24日', type: '再次交談', role: '1' },
  ];
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw5_m0_0'], '姊妹甲');
  assert.equal(res['mw5_m0_1'], '姊妹丙', 'same-gender helper preferred over a brother with longer gap');
});

// ── CBS reader pool ───────────────────────────────────────────────────────────

test('CBS reader (_1) draws from 研經班朗讀, not the conductor pool', () => {
  const week = {
    id: 6,
    treasures: [],
    ministry: [],
    living: [{ id: 'cbs', cat: 'cbs', roleLabel: '主持/朗讀', title: '會眾研經班' }],
  };
  const people = [
    brother('主持甲', ['研經班主持']),
    brother('主持乙', ['研經班主持']),
    brother('朗讀甲', ['研經班朗讀']),
  ];
  const res = suggestMidweekWeek(people, week, {}, [], REF);
  assert.equal(res['mw6_cbs_0'], '主持甲');
  assert.equal(res['mw6_cbs_1'], '朗讀甲', 'reader must come from the 研經班朗讀 pool');
});

// ── roleLabel override: admin's pair/single judgment beats the title ──────────

test('ministry part with 演講 title but admin-added 助手 uses the mixed demo pool', () => {
  const week = {
    id: 7,
    treasures: [],
    ministry: [{ id: 'm2', cat: 'ministry', roleLabel: '學生/助手', title: '解釋自己的信仰 — 演講' }],
    living: [],
  };
  // Only sisters qualify for demos; no 傳道演講 brother exists. If the admin
  // marked this part as having a helper, it is a demo — sisters are eligible.
  const people = [sister('姊妹甲', ['傳道示範']), sister('姊妹乙', ['傳道示範'])];
  const res = suggestMidweekWeek(people, week, {}, [], REF);
  assert.equal(res['mw7_m2_0'], '姊妹甲', 'roleLabel with / overrides the 演講 title');
  assert.equal(res['mw7_m2_1'], '姊妹乙');
});

test('你會怎麼說 discussion part suggests a 傳道討論主持 brother, not a 傳道示範 sister', () => {
  const week = {
    id: 8,
    treasures: [],
    ministry: [{ id: 'm2', cat: 'ministry', roleLabel: undefined, title: '你會怎麼說？' }],
    living: [],
  };
  const people = [
    sister('姊妹甲', ['傳道示範']),
    brother('長老甲', ['傳道討論主持']),
  ];
  const res = suggestMidweekWeek(people, week, {}, [], REF);
  assert.equal(res['mw8_m2_0'], '長老甲', 'discussion parts are conducted by an elder/MS (S-38 ¶6)');
});
