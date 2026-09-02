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

test('future assignments count against a candidate (bidirectional gap)', () => {
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const history = [
    { name: '甲', cat: 'chairman', date: '7月 15日' }, // 14 days AFTER 7/1 → gap 14
    { name: '乙', cat: 'chairman', date: '5月 6日' },  // 56 days before 7/1 → gap 56
  ];
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '乙', '甲 is already booked two weeks later — 乙 must win');
});

test('assignment ON refDate itself is ignored (the meeting being planned)', () => {
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const history = [
    { name: '甲', cat: 'chairman', date: '7月 1日' }, // same day as ref → not history
    { name: '乙', cat: 'chairman', date: '6月 3日' }, // 28 days before
  ];
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '甲', 'same-day entry must not count against 甲');
});

test('reassigning an earlier week does not pick someone already booked the next week (鄭雅子 case)', () => {
  // Editing 9/10's 學生 slot: 雅子 is already the 學生 on 9/17, so the free
  // sister must be suggested even though 雅子 has the longer PAST gap.
  const ref = new Date(2026, 8, 10); // 2026-09-10
  const sister = (name, quals) => ({ name, g: 'F', quals, status: 'active' });
  const people = [sister('雅子', ['傳道示範']), sister('美玲', ['傳道示範'])];
  const week = {
    id: 1, treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談' }],
  };
  const history = [
    { name: '雅子', cat: 'ministry', date: '9月 17日', type: '初次交談', role: '0' }, // booked next week
    { name: '美玲', cat: 'ministry', date: '8月 20日', type: '初次交談', role: '0' }, // 21 days before
  ];
  const res = suggestMidweekWeek(people, week, {}, history, ref);
  assert.equal(res['mw1_m0_0'], '美玲', '雅子 is already scheduled on 9/17');
});

test('crowd demotion: an assignment in ANOTHER category within ±7 days demotes the candidate', () => {
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const history = [
    { name: '甲', cat: 'prayer', date: '7月 4日' },    // 3 days after ref, different cat
    { name: '乙', cat: 'chairman', date: '5月 6日' },  // chairman 56 days ago
  ];
  // Old engine: 甲 never chaired (gap 9999) → wins. New: 甲 is busy that week → 乙.
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '乙', '甲 has another part 3 days later — demoted');
});

test('crowd demotion never leaves a slot empty when everyone is busy', () => {
  const people = [brother('甲', ['傳道與生活主席'])];
  const history = [{ name: '甲', cat: 'prayer', date: '7月 4日' }];
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '甲', 'crowded is a demotion, not an exclusion');
});

test('monthly repeat demotion: a ministry student practice 12 days ago (outside the 7-day crowd window) still loses to someone free that month', () => {
  const sister = (name, quals) => ({ name, g: 'F', quals, status: 'active' });
  const people = [sister('甲', ['傳道示範']), sister('乙', ['傳道示範'])];
  const week = {
    id: 1, treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談' }],
  };
  const history = [
    { name: '甲', cat: 'ministry', date: '6月 19日', type: '初次交談', role: '0' }, // 12 days before REF (7/1)
  ];
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw1_m0_0'], '乙', '甲 practiced ministry only 12 days ago — still within the month');
});

test('monthly repeat demotion does not leak into unrelated categories', () => {
  // Both are tied on chairman history (neither has ever chaired), so with no
  // leakage the stable sort keeps 甲 first. 甲 also has a ministry-cat entry
  // 12 days ago — inside the ministry monthly window but outside the 7-day
  // crowd window — which must NOT bleed into the (unrelated) chairman pick.
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const history = [
    { name: '甲', cat: 'ministry', date: '6月 19日', type: '初次交談', role: '0' },
  ];
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '甲', 'a ministry-only monthly-repeat entry must not demote 甲 for chairman');
});

test('monthly repeat demotion never leaves a ministry slot empty when the whole pool practiced recently', () => {
  const sister = (name, quals) => ({ name, g: 'F', quals, status: 'active' });
  const people = [sister('甲', ['傳道示範'])];
  const week = {
    id: 1, treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談' }],
  };
  const history = [
    { name: '甲', cat: 'ministry', date: '6月 19日', type: '初次交談', role: '0' },
  ];
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw1_m0_0'], '甲', 'monthly repeat is a demotion, not an exclusion — the only candidate still fills it');
});

test('weekend: speaker already booked on a future row loses to a free speaker', () => {
  const people = [brother('王', ['公眾演講']), brother('陳', ['公眾演講'])];
  const rows = [
    { date: '7/15', speaker: '王', chair: '', wt: '', read: '' }, // 14 days after ref
    { date: '4/5',  speaker: '陳', chair: '', wt: '', read: '' }, // long ago
  ];
  const res = suggestWeekendRow(people, rows, {}, REF);
  assert.equal(res.speaker, '陳', '王 is already booked on 7/15');
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

test('rotation may not resurrect a much-more-recently-used candidate', () => {
  // 用心準備傳道工作 parts are one family of student practice: never having done
  // THIS title does not make someone due. 甲 practised 6 weeks ago (outside the
  // monthly window, so not demoted) and has never done 教導人成為門徒;
  // 乙 last practised 5 months ago. Fairness must win — the rotation window only
  // reorders candidates within one meeting cycle of each other.
  const week = {
    id: 9,
    treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '教導人成為門徒 — 《美好生命》第19課' }],
  };
  const people = [sister('甲', ['傳道示範']), sister('乙', ['傳道示範'])];
  const history = [
    { name: '甲', cat: 'ministry', date: '5月 20日', type: '初次交談', role: '0' },       // 42 days before REF
    { name: '乙', cat: 'ministry', date: '2月 1日',  type: '教導人成為門徒', role: '0' }, // 150 days before REF
  ];
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw9_m0_0'], '乙', '甲 practised 6 weeks ago — a new title must not pull her back in');
});

test('ministry practice history is shared across the whole family (demo + 演講)', () => {
  // 弟兄甲 gave a ministry 演講 6 weeks ago; that IS ministry practice, so he must
  // not rank as "never practised" against 弟兄乙, who last practised 4 months ago.
  const week = {
    id: 10,
    treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談 — 向住戶作見證' }],
  };
  const people = [brother('弟兄甲', ['傳道示範', '傳道演講']), brother('弟兄乙', ['傳道示範'])];
  const history = [
    { name: '弟兄甲', cat: 'ministrytalk', date: '5月 20日', type: '演講', role: '0' }, // 42 days before REF
    { name: '弟兄乙', cat: 'ministry',     date: '3月 2日',  type: '初次交談', role: '0' },
  ];
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw10_m0_0'], '弟兄乙', 'a recent 演講 counts as ministry practice');
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

// ── monthly repeat demotion (the ±28-day family window) ──────────────────────
// These pin the demotion itself. The older monthly tests are all cases where
// plain fairness already produces the asserted answer, so deleting
// `monthlyByFamily` from effCrowded left them green — a reviewer caught that.
// Here the monthly-window candidate has the BETTER fairness gap, so only the
// demotion can flip the pick.

test('monthly demotion outranks a merely-crowded rival (ministry)', () => {
  // 甲: practised 20 days ago → family gap 20, outside the 7-day crowd window.
  // 乙: never practised (family gap 9999) but has a prayer part 3 days later,
  //     so the general crowd rule demotes him.
  // Fairness alone picks 甲; the ±28-day monthly window must flip it to 乙.
  const week = {
    id: 30, treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談 — 向住戶作見證' }],
  };
  const people = [sister('甲', ['傳道示範']), sister('乙', ['傳道示範'])];
  const history = [
    { name: '甲', cat: 'ministry', date: '6月 11日', type: '初次交談', role: '0' }, // 20 days before REF
    { name: '乙', cat: 'prayer',   date: '7月 4日' },                                // 3 days after REF
  ];
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw30_m0_0'], '乙', '甲 practised 20 days ago — inside the month');
});

test('monthly demotion outranks a merely-crowded rival (朗讀 family)', () => {
  const week = {
    id: 31, ministry: [], living: [],
    treasures: [{ id: 't2', cat: 'reading', roleLabel: '學生', title: '讀經' }],
  };
  const people = [brother('丙', ['經文朗讀']), brother('丁', ['經文朗讀'])];
  const history = [
    { name: '丙', cat: 'cbsread', date: '6月 11日' }, // a 朗讀 turn 20 days before REF
    { name: '丁', cat: 'prayer',  date: '7月 4日' },  // busy that week, but no 朗讀 turn
  ];
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw31_t2_0'], '丁', '丙 read 20 days ago — inside the month');
});

// ── 學生／助手 pairing variety ────────────────────────────────────────────────

test('helper slot avoids a sister recently paired with this student', () => {
  // 甲 is already the 學生. 乙 partnered 甲 two months ago; 丙 never has.
  // Both have the same fairness gap, so the pairing history is what decides.
  const week = {
    id: 20, treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談 — 向住戶作見證' }],
  };
  const people = [sister('甲', ['傳道示範']), sister('乙', ['傳道示範']), sister('丙', ['傳道示範'])];
  const history = [
    // 甲 + 乙 served together on 5月 2日 (60 days before REF)
    { name: '甲', cat: 'ministry', date: '5月 2日', type: '初次交談', role: '0', pairId: 'w9_m0' },
    { name: '乙', cat: 'ministry', date: '5月 2日', type: '初次交談', role: '1', pairId: 'w9_m0' },
    // 丙 was 助手 the same day, with someone outside the candidate pool — so 乙
    // and 丙 are identical on fairness AND on part-type rotation (both last did
    // 初次交談 as 助手 on the same date). Only the pairing history separates them.
    { name: '丁', cat: 'ministry', date: '5月 2日', type: '初次交談', role: '0', pairId: 'w9_m1' },
    { name: '丙', cat: 'ministry', date: '5月 2日', type: '初次交談', role: '1', pairId: 'w9_m1' },
  ];
  const res = suggestMidweekWeek(people, week, { 'mw20_m0_0': '甲' }, history, REF);
  assert.equal(res['mw20_m0_1'], '丙', '乙 partnered 甲 two months ago — 丙 is the fresh pairing');
});

test('pair variety is a demotion, not an exclusion', () => {
  const week = {
    id: 21, treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談 — 向住戶作見證' }],
  };
  const people = [sister('甲', ['傳道示範']), sister('乙', ['傳道示範'])];
  const history = [
    { name: '甲', cat: 'ministry', date: '5月 2日', type: '初次交談', role: '0', pairId: 'w9_m0' },
    { name: '乙', cat: 'ministry', date: '5月 2日', type: '初次交談', role: '1', pairId: 'w9_m0' },
  ];
  const res = suggestMidweekWeek(people, week, { 'mw21_m0_0': '甲' }, history, REF);
  assert.equal(res['mw21_m0_1'], '乙', '乙 is the only candidate left — the slot still fills');
});

test('a pairing older than the window no longer counts against the candidate', () => {
  const week = {
    id: 22, treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談 — 向住戶作見證' }],
  };
  const people = [sister('甲', ['傳道示範']), sister('乙', ['傳道示範']), sister('丙', ['傳道示範'])];
  const history = [
    // 甲 + 乙 served together on 12月 31日 — 183 days from REF, just outside the
    // 180-day window (the ±6-month year inference caps how far a date can land).
    { name: '甲', cat: 'ministry', date: '12月 31日', type: '初次交談', role: '0', pairId: 'w1_m0' },
    { name: '乙', cat: 'ministry', date: '12月 31日', type: '初次交談', role: '1', pairId: 'w1_m0' },
    { name: '丙', cat: 'ministry', date: '5月 2日', type: '初次交談', role: '0', pairId: 'w9_m1' },
    { name: '丁', cat: 'ministry', date: '5月 2日', type: '初次交談', role: '1', pairId: 'w9_m1' },
  ];
  const res = suggestMidweekWeek(people, week, { 'mw22_m0_0': '甲' }, history, REF);
  assert.equal(res['mw22_m0_1'], '乙', '乙 has the longer gap and the old pairing is out of window');
});

// ── 朗讀 family (經文朗讀 + 研經班朗讀 share one fairness history) ────────────

test('a recent 研經班朗讀 counts against a brother for 經文朗讀 (朗讀 family)', () => {
  const week = {
    id: 11, ministry: [], living: [],
    treasures: [{ id: 't2', cat: 'reading', roleLabel: '學生', title: '讀經' }],
  };
  const people = [
    brother('甲', ['經文朗讀', '研經班朗讀']),
    brother('乙', ['經文朗讀']),
  ];
  const history = [
    { name: '甲', cat: 'cbsread', date: '5月 20日' }, // 42 days before REF — a 朗讀 turn
    { name: '乙', cat: 'reading', date: '2月 1日' },  // 150 days before REF
  ];
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw11_t2_0'], '乙', '甲 read at 研經班 6 weeks ago — not "never read"');
});

test('朗讀 and ministry families are independent (a 朗讀 turn does not demote a ministry pick)', () => {
  // 甲 read 12 days ago — inside the monthly window for the 朗讀 family, but
  // that must not bleed into the (separate) 用心準備傳道工作 family. Neither
  // brother has ever done ministry practice, so the stable order keeps 甲 first.
  const week = {
    id: 12, treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', roleLabel: '學生/助手', title: '初次交談 — 向住戶作見證' }],
  };
  const people = [
    brother('甲', ['傳道示範', '經文朗讀']),
    brother('乙', ['傳道示範']),
  ];
  const history = [{ name: '甲', cat: 'reading', date: '6月 19日' }]; // 12 days before REF
  const res = suggestMidweekWeek(people, week, {}, history, REF);
  assert.equal(res['mw12_m0_0'], '甲', 'a 朗讀 entry must not demote 甲 for ministry practice');
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

// ── 先驅 preference (appointments.mjs) ────────────────────────────────────────
// The nudge is worth PIONEER_GAP_BONUS_DAYS (7) of extra rest: enough to win a
// tie, never enough to outrank someone genuinely much less used.
const pioneer = (name, quals) => ({ ...brother(name, quals), appt: '先驅' });

test('先驅 wins a tie against an equally rested brother', () => {
  const people = [brother('甲', ['傳道與生活主席']), pioneer('乙', ['傳道與生活主席'])];
  const history = [
    { name: '甲', cat: 'chairman', date: '5月 6日' },
    { name: '乙', cat: 'chairman', date: '5月 6日' },
  ];
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '乙');
});

test('先驅 does NOT outrank a brother who is genuinely much less used', () => {
  // 甲 last served 4 months ago, 乙 (先驅) last week. Seven days of bonus must
  // not resurrect someone the fairness gap has just pushed down.
  const people = [brother('甲', ['傳道與生活主席']), pioneer('乙', ['傳道與生活主席'])];
  const history = [
    { name: '甲', cat: 'chairman', date: '3月 4日' },
    { name: '乙', cat: 'chairman', date: '6月 24日' },
  ];
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '甲');
});

test('先驅 does not override the S-38 gender rule', () => {
  // Ministry 演講 parts are brothers-only; a 先驅 sister must stay ineligible.
  const week = {
    id: 1, treasures: [], living: [],
    ministry: [{ id: 'm0', cat: 'ministry', title: '解釋自己的信仰 — 演講', roleLabel: '學生' }],
  };
  const people = [
    { name: '姊妹先驅', g: 'F', quals: ['傳道演講', '傳道示範'], status: 'active', appt: '先驅' },
    brother('弟兄', ['傳道演講']),
  ];
  const res = suggestMidweekWeek(people, week, {}, [], REF);
  assert.equal(res['mw1_m0_0'], '弟兄');
});
