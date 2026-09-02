import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCnDate } from './cnDate.mjs';
import {
  serviceYearStartYear, buildMonthWindow, coveredMonths, collectPersonEvents,
  buildHeatmapRows, buildPersonDetail, buildPersonSummary, weekOfMonth, monthKey,
  windowLabel, buildGridExportRows, buildGridText, buildPersonExportRows, attentionNote,
} from './heatmap.mjs';

const REF = new Date(2026, 7, 22); // 2026-08-22

function mkWeek(id, date, over = {}) {
  return {
    id, date,
    chairman: over.chairman ?? '', openPrayer: over.openPrayer ?? '', closePrayer: over.closePrayer ?? '',
    treasures: over.treasures ?? [], ministry: over.ministry ?? [], living: over.living ?? [],
  };
}

// ── The regression guard for the bug that shipped ────────────────────────────
// The heatmap must date a string exactly the way the rest of the app does. A
// private service-year parser here once read "10月 8日" as LAST October while
// cnDate read it as NEXT October, which silently sorted a member's whole
// 指派記錄 backwards. Mirrors the candidates/suggest agreement test.
test('heatmap dates agree with the shared cnDate parser', () => {
  for (const s of ['10月 8日', '9月 16日', '5月 6日', '8月 6日', '1月 7日', '8/9']) {
    const weeks = [mkWeek(1, s, { chairman: '甲' })];
    const evts = collectPersonEvents(weeks, {}, [], REF);
    const got = evts.get('甲')[0].date;
    const want = parseCnDate(s, REF);
    assert.equal(+got, +want, `${s}: heatmap said ${got} but cnDate says ${want}`);
  }
});

test('指派記錄 sorts ascending across a year boundary (the 鄧渝文 case)', () => {
  // 5/6 and 5/13 are May 2026; 8/6 is Aug 2026; 10/8 is Oct 2026 — a FUTURE
  // booking, which must come last, not first.
  const weeks = [
    mkWeek(1, '10月 8日', { ministry: [{ id: 'm0', title: '初次交談', roleLabel: '學生/助手', assign: ['鄧渝文', '包愛倫'] }] }),
    mkWeek(2, '5月 6日', { ministry: [{ id: 'm0', title: '初次交談', roleLabel: '學生/助手', assign: ['鄧渝文', '鄭雅子'] }] }),
    mkWeek(3, '5月 13日', { ministry: [{ id: 'm0', title: '初次交談', roleLabel: '學生/助手', assign: ['鄧渝文', '賴麗詩'] }] }),
    mkWeek(4, '8月 6日', { ministry: [{ id: 'm0', title: '初次交談', roleLabel: '學生/助手', assign: ['鄧渝文', '何惠英'] }] }),
  ];
  const d = buildPersonDetail('鄧渝文', 'F', weeks, {}, [], { refDate: REF });
  assert.deepEqual(d.records.map((r) => r.date), ['5/6', '5/13', '8/6', '10/8']);
  assert.deepEqual(d.records.map((r) => r.year), [2026, 2026, 2026, 2026]);
});

test('a stored isoDate overrides the ambiguous string, and spans multiple years', () => {
  // Two Septembers a year apart. With only the display string these are
  // indistinguishable — inference would collapse both onto one year. With
  // isoDate they land in the right months, which is the whole point of the field.
  const weeks = [
    { ...mkWeek(1, '9月 16日', { chairman: '甲' }), isoDate: '2025-09-16' },
    { ...mkWeek(2, '9月 15日', { chairman: '甲' }), isoDate: '2026-09-15' },
  ];
  const evts = collectPersonEvents(weeks, {}, [], REF).get('甲');
  assert.deepEqual(evts.map((e) => e.date.getFullYear()), [2025, 2026]);

  // Both months are "covered", a year apart — impossible without isoDate.
  const covered = coveredMonths(weeks, [], REF);
  assert.ok(covered.has(monthKey(2025, 9)));
  assert.ok(covered.has(monthKey(2026, 9)));

  // And the service-year view can now actually reach back to Sept 2025.
  const { rows } = buildHeatmapRows([{ name: '甲', g: 'M' }], weeks, {}, [], {
    mode: 'serviceYear', refDate: REF,
  });
  const sept25 = rows[0].monthly.find((m) => m.key === monthKey(2025, 9));
  assert.equal(sept25.n, 1, 'Sept 2025 should be populated from isoDate');
  assert.equal(sept25.covered, true);
});

test('a malformed isoDate falls back instead of dropping the row', () => {
  const weeks = [{ ...mkWeek(1, '8月 5日', { chairman: '甲' }), isoDate: 'not-a-date' }];
  const evts = collectPersonEvents(weeks, {}, [], REF).get('甲');
  assert.equal(evts.length, 1);
  assert.equal(evts[0].date.getFullYear(), 2026);
});

test('rolling window is centred on the current month; serviceYear runs Sept→Aug', () => {
  const rolling = buildMonthWindow({ mode: 'rolling', range: 12, refDate: REF });
  assert.equal(rolling.length, 12);
  assert.deepEqual(rolling[0], { year: 2026, month: 2 });   // 6 back
  assert.deepEqual(rolling[6], { year: 2026, month: 8 });   // current month
  assert.deepEqual(rolling[11], { year: 2027, month: 1 });  // 5 forward

  const small = buildMonthWindow({ mode: 'rolling', range: 3, refDate: REF });
  assert.deepEqual(small.map((m) => m.month), [7, 8, 9]);

  const sy = buildMonthWindow({ mode: 'serviceYear', refDate: REF });
  assert.deepEqual(sy[0], { year: 2025, month: 9 });
  assert.deepEqual(sy[11], { year: 2026, month: 8 });
  assert.equal(serviceYearStartYear(REF), 2025);
});

test('serviceYear offset steps whole years; rolling offset steps by range', () => {
  const prevYear = buildMonthWindow({ mode: 'serviceYear', offset: 1, refDate: REF });
  assert.deepEqual(prevYear[0], { year: 2024, month: 9 });

  const back = buildMonthWindow({ mode: 'rolling', range: 6, offset: 1, refDate: REF });
  const now = buildMonthWindow({ mode: 'rolling', range: 6, offset: 0, refDate: REF });
  assert.equal(back[0].month, ((now[0].month - 6 - 1 + 12) % 12) + 1);
});

test('collectPersonEvents pulls chairman + pair parts + weekend rows, with partners', () => {
  const weeks = [mkWeek(1, '8月 5日', {
    ministry: [{ id: 'm0', title: '傳道示範', roleLabel: '學生/助手', assign: ['陳美惠', '張怡君'] }],
  })];
  const weekendRows = [{ date: '8/9', type: 'schedule', speaker: '陳美惠' }];
  const evts = collectPersonEvents(weeks, {}, weekendRows, REF);
  const chen = evts.get('陳美惠');
  assert.equal(chen.length, 2);
  assert.equal(chen[0].label, '傳道示範（學生）');
  assert.equal(chen[0].partner, '張怡君');
  assert.equal(chen[0].family, true);
  assert.equal(evts.get('張怡君')[0].label, '傳道示範（助手）');
});

test('sister flags on any two parts in a month; brother only on ministry-family parts', () => {
  const weeks = [
    mkWeek(1, '7月 1日', { ministry: [{ id: 'm0', title: '傳道示範', roleLabel: '學生', assign: ['陳美惠'] }] }),
    mkWeek(2, '7月 8日', {
      closePrayer: '陳美惠',
      treasures: [{ id: 't0', title: '寶藏演講', assign: ['林俊宏'] }],
    }),
    mkWeek(3, '7月 15日', { living: [{ id: 'l0', title: '生活演講', assign: ['林俊宏'] }] }),
  ];
  const people = [{ name: '陳美惠', g: 'F' }, { name: '林俊宏', g: 'M' }];
  const { rows } = buildHeatmapRows(people, weeks, {}, [], { refDate: REF });
  assert.equal(rows.find((r) => r.person.name === '陳美惠').dbl, 1);
  // 寶藏演講 + 生活演講 are outside the 用心準備傳道工作 bucket → not a double
  assert.equal(rows.find((r) => r.person.name === '林俊宏').dbl, 0);
});

test('uncovered months never produce a phantom idle flag', () => {
  // Only ONE month has any meeting loaded. Every other month in the window is
  // "no data", not "idle" — nobody should be flagged 未派.
  const weeks = [mkWeek(1, '8月 5日', { chairman: '林俊宏' })];
  const people = [{ name: '林俊宏', g: 'M' }, { name: '王小明', g: 'M' }];
  const { rows, coveredCount } = buildHeatmapRows(people, weeks, {}, [], { refDate: REF });
  assert.equal(coveredCount, 1);
  for (const r of rows) {
    assert.equal(r.idle, 0, `${r.person.name} should not be flagged idle on a 1-month-covered window`);
    assert.equal(r.rank, 0);
  }
});

test('uncovered months inside a well-covered window do not fake an idle run', () => {
  // Four covered months (3月,4月,7月,8月) with unloaded gaps around them. 王小明
  // serves in EVERY covered month, so he is not idle at all — but the unloaded
  // 9月–1月 tail would look like a 5-month run if uncovered months counted.
  const served = ['3月 4日', '4月 1日', '7月 1日', '8月 5日'];
  const weeks = served.map((d, i) => mkWeek(i + 1, d, { chairman: '王小明' }));
  const people = [{ name: '王小明', g: 'M' }];
  const { rows, coveredCount, idleThreshold } = buildHeatmapRows(people, weeks, {}, [], { refDate: REF });
  assert.equal(coveredCount, 4);
  assert.equal(idleThreshold, 3); // low enough that a 5-month fake run would trip it
  assert.equal(rows[0].idle, 0);
});

test('a genuine idle run is still flagged once enough months are covered', () => {
  // Six covered months; 王小明 serves only in the first, so he has a 5-month
  // idle run against a threshold of max(3, round(6/2)) = 3.
  const months = ['3月 4日', '4月 1日', '5月 6日', '6月 3日', '7月 1日', '8月 5日'];
  const weeks = months.map((d, i) => mkWeek(i + 1, d, { chairman: i === 0 ? '王小明' : '林俊宏' }));
  const people = [{ name: '王小明', g: 'M' }];
  const { rows, coveredCount } = buildHeatmapRows(people, weeks, {}, [], { mode: 'rolling', range: 12, refDate: REF });
  assert.equal(coveredCount, 6);
  assert.equal(rows[0].idle, 5);
  assert.equal(rows[0].rank, 1);
});

test('monthMode is false only for the 3-month rolling range', () => {
  const people = [{ name: '王小明', g: 'M' }];
  const mm = (o) => buildHeatmapRows(people, [], {}, [], { refDate: REF, ...o }).monthMode;
  assert.equal(mm({ range: 12 }), true);
  assert.equal(mm({ range: 6 }), true);
  assert.equal(mm({ range: 3 }), false);
  assert.equal(mm({ mode: 'serviceYear' }), true);
});

test('person detail is scoped to the window, and the summary describes it', () => {
  const weeks = [
    mkWeek(1, '8月 5日', { ministry: [{ id: 'm0', title: '傳道示範', roleLabel: '學生', assign: ['陳美惠'] }] }),
    mkWeek(2, '1月 7日', { ministry: [{ id: 'm0', title: '傳道示範', roleLabel: '學生', assign: ['陳美惠'] }] }),
  ];
  // 3-month window (7月–9月 2026) excludes the January booking.
  const narrow = buildPersonDetail('陳美惠', 'F', weeks, {}, [], { range: 3, refDate: REF });
  assert.equal(narrow.total, 1);
  assert.match(buildPersonSummary('陳美惠', 'F', narrow), /這 3 個月共有 1 份指派/);

  const sy = buildPersonDetail('陳美惠', 'F', weeks, {}, [], { mode: 'serviceYear', refDate: REF });
  assert.match(buildPersonSummary('陳美惠', 'F', sy), /這個服務年度/);
});

test('weekOfMonth buckets a month into calendar weeks', () => {
  assert.equal(weekOfMonth(new Date(2026, 7, 1)), 0);
  assert.equal(weekOfMonth(new Date(2026, 7, 7)), 0);
  assert.equal(weekOfMonth(new Date(2026, 7, 8)), 1);
  assert.equal(weekOfMonth(new Date(2026, 7, 31)), 4);
});

test('coveredMonths ignores event and suspended weekend rows', () => {
  const rows = [
    { date: '8/9', type: 'schedule', speaker: '甲' },
    { date: '9/13', type: 'event', label: '大會' },
    { date: '10/11', type: 'suspended', label: '暫停' },
  ];
  const covered = coveredMonths([], rows, REF);
  assert.ok(covered.has(monthKey(2026, 8)));
  assert.ok(!covered.has(monthKey(2026, 9)));
  assert.ok(!covered.has(monthKey(2026, 10)));
});

// ── The regression guard for the "I have to refresh" bug ─────────────────────
// Slot IDs are `mw{weekId}_{partKey}_{n}`. This module built them from the bare
// partKey, so the lookup never matched and every part silently fell back to
// `part.assign` — the snapshot loaded at mount. Live edits therefore only
// appeared in 指派分布 after a page reload. Fixtures that set only `assign`
// cannot catch this: the override MUST win.
test('a live getAssign override beats the part.assign snapshot', () => {
  const weeks = [mkWeek(7, '8月 5日', {
    ministry: [{ id: 'm0', title: '傳道示範', roleLabel: '學生/助手', assign: ['舊學生', '舊助手'] }],
  })];
  const assignments = { mw7_m0_0: '新學生', mw7_m0_1: '新助手' };
  const ga = (slotId, fallback) => (slotId in assignments ? assignments[slotId] : (fallback ?? ''));

  const evts = collectPersonEvents(weeks, {}, [], REF, ga);
  assert.ok(evts.get('新學生'), '新學生 must appear — the reassignment is live');
  assert.equal(evts.get('新學生')[0].partner, '新助手');
  assert.equal(evts.get('舊學生'), undefined, '舊學生 was replaced and must be gone');

  // Clearing a slot must remove the person too, not fall back to the snapshot.
  const cleared = collectPersonEvents(weeks, {}, [], REF, (id, fb) => (id === 'mw7_m0_0' ? '' : (fb ?? '')));
  assert.equal(cleared.get('舊學生'), undefined);
});

test('the assignments-map form of the same override also wins', () => {
  const weeks = [mkWeek(7, '8月 5日', {
    treasures: [{ id: 't0', title: '寶藏演講', assign: ['舊'] }],
  })];
  const evts = collectPersonEvents(weeks, { mw7_t0_0: '新' }, [], REF);
  assert.ok(evts.get('新'));
  assert.equal(evts.get('舊'), undefined);
});

// ── Window label ─────────────────────────────────────────────────────────────
// Rolling windows are CENTRED on the current month, so 12 months almost always
// cross a year boundary — the year-less "3月 – 2月" read as random noise.
test('windowLabel carries years, and collapses within one year', () => {
  const wide = buildMonthWindow({ mode: 'rolling', range: 12, refDate: new Date(2026, 8, 2) });
  assert.equal(windowLabel(wide, 'rolling'), '2026年3月 – 2027年2月');

  const narrow = buildMonthWindow({ mode: 'rolling', range: 3, refDate: new Date(2026, 6, 1) });
  assert.equal(windowLabel(narrow, 'rolling'), '2026年6月 – 8月');

  const sy = buildMonthWindow({ mode: 'serviceYear', refDate: REF });
  assert.equal(windowLabel(sy, 'serviceYear'), '2025–2026 服務年度');
  assert.equal(windowLabel([], 'rolling'), '');
});

// ── Export rows ──────────────────────────────────────────────────────────────
test('grid export rows mirror the grid: months, 件數 and the 需要注意 note', () => {
  const weeks = [
    mkWeek(1, '7月 1日', { ministry: [{ id: 'm0', title: '傳道示範', roleLabel: '學生', assign: ['陳美惠'] }] }),
    mkWeek(2, '7月 8日', { closePrayer: '陳美惠' }),
  ];
  const people = [{ name: '陳美惠', g: 'F' }];
  const data = buildHeatmapRows(people, weeks, {}, [], { range: 3, refDate: REF });
  const rows = buildGridExportRows(data, 'rolling');

  // REF is 2026-08-22 and rolling windows are centred → 7月/8月/9月.
  assert.deepEqual(rows[0], ['指派分布', '2026年7月 – 9月']);
  assert.deepEqual(rows[2], ['姓名', '性別', '2026年7月', '2026年8月', '2026年9月', '件數', '需要注意']);
  const chen = rows[3];
  assert.equal(chen[0], '陳美惠');
  assert.equal(chen[1], '姊妹');
  assert.equal(chen[2], '2');
  assert.equal(chen[3], '—', 'an uncovered month is 無資料, not a zero');
  assert.equal(chen[chen.length - 2], '2');
  assert.equal(chen[chen.length - 1], attentionNote(data.rows[0]));
  assert.equal(chen[chen.length - 1], '同月 1 次重複');

  const text = buildGridText(data, 'rolling');
  assert.match(text, /2026年7月 – 9月 · 1 位/);
  assert.match(text, /陳美惠（姊）　2 份　7月×2　⚠ 同月 1 次重複/);
});

test('person export rows carry full dates and the same summary as the screen', () => {
  const weeks = [mkWeek(1, '7月 1日', {
    ministry: [{ id: 'm0', title: '傳道示範', roleLabel: '學生/助手', assign: ['陳美惠', '張怡君'] }],
  })];
  const detail = buildPersonDetail('陳美惠', 'F', weeks, {}, [], { range: 3, refDate: REF });
  const rows = buildPersonExportRows('陳美惠', 'F', detail);

  assert.deepEqual(rows[0], ['陳美惠（姊妹）', '2026年7月 – 9月']);
  assert.equal(rows[1][0], buildPersonSummary('陳美惠', 'F', detail));
  const head = rows.findIndex((r) => r[0] === '日期');
  assert.deepEqual(rows[head], ['日期', '項目', '搭檔']);
  assert.deepEqual(rows[head + 1], ['2026/7/1', '傳道示範（學生）', '張怡君']);
});
