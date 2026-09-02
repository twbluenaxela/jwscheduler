// Pure, DB-free helpers for the 指派分布 (assignment distribution heatmap) on
// the Overview page. No React, no fetch — testable with `node --test`.
//
// DATES: this module does NOT parse dates itself — it calls `resolveRowDate`
// from `cnDate.mjs`, which prefers a row's stored `isoDate` and only falls back
// to inferring a year from the legacy display string. An earlier version had its
// own service-year parser; it disagreed with the shared one (reading "10月 8日"
// as last October while the rest of the app read it as next October), which
// silently sorted a member's whole 指派記錄 wrong. Never reintroduce one here.
//
// TIME WINDOW: rolling windows are CENTRED on the current month (half past, half
// upcoming). That mirrors the ✦ suggest engine, whose fairness gap is already
// bidirectional so an earlier week never double-books someone booked ahead, and
// it degrades gracefully for rows not yet backfilled with an isoDate (whose
// inferred year is only trustworthy near "now"). A fixed Sept–Aug service year
// is available as a separate mode.
//
// COVERAGE: a month with no meetings loaded is NOT a month with zero
// assignments. `coveredKeys` marks the months that actually have a scheduled
// meeting; uncovered months are excluded from idle runs (otherwise everyone
// gets a phantom "12 個月未派") and render as 無資料 rather than as an empty
// ramp cell.
//
// Flag rules (from member feedback, see CLAUDE.md 指派分布 section):
//   - 姊妹: should not have two parts in the same calendar month (any type).
//   - 弟兄: should not appear twice in the same month within the
//     用心準備傳道工作 bucket — 傳道示範 / 傳道演講 / 助手 / 經文朗讀,
//     treated as one bucket (matched by substring on the assembled label).
//   - Counting: 1 part = 1 count, no weighting by part type.

import { resolveRowDate } from './cnDate.mjs';

const MINISTRY_FAMILY_MARKERS = ['傳道示範', '傳道演講', '助手', '經文朗讀'];

function isMinistryFamily(label) {
  const s = String(label ?? '');
  return MINISTRY_FAMILY_MARKERS.some((m) => s.includes(m));
}

export function monthKey(year, month) { return `${year}-${month}`; }

function keyOfDate(d) { return monthKey(d.getFullYear(), d.getMonth() + 1); }

// Week-of-month bucket (0-4) — a plain calendar split, no service-year anchor.
export function weekOfMonth(date) { return Math.floor((date.getDate() - 1) / 7); }

export function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

// How many week-columns a month needs (4 or 5).
export function weeksInMonth(year, month) { return Math.ceil(daysInMonth(year, month) / 7); }

// The September that starts the service year containing refDate.
export function serviceYearStartYear(refDate = new Date()) {
  const m = refDate.getMonth() + 1;
  return m >= 9 ? refDate.getFullYear() : refDate.getFullYear() - 1;
}

function addMonths(year, month, delta) {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

// The visible months, oldest → newest.
//   rolling      — `range` months CENTRED on the current month; arrows step by `range`
//   serviceYear  — the Sept–Aug block containing refDate; arrows step whole years
export function buildMonthWindow({ mode = 'rolling', range = 12, offset = 0, refDate = new Date() } = {}) {
  const out = [];
  if (mode === 'serviceYear') {
    const startYear = serviceYearStartYear(refDate) - offset;
    for (let i = 0; i < 12; i++) out.push(addMonths(startYear, 9, i));
    return out;
  }
  const back = Math.floor(range / 2);
  const base = addMonths(refDate.getFullYear(), refDate.getMonth() + 1, -back - offset * range);
  for (let i = 0; i < range; i++) out.push(addMonths(base.year, base.month, i));
  return out;
}

// Months that actually have a meeting loaded, so "no data" can be told apart
// from "zero assignments".
export function coveredMonths(midweekWeeks, weekendRows, refDate = new Date()) {
  const keys = new Set();
  for (const w of midweekWeeks ?? []) {
    const d = resolveRowDate(w, refDate);
    if (d) keys.add(keyOfDate(d));
  }
  for (const r of weekendRows ?? []) {
    if (r.type === 'event' || r.type === 'suspended') continue;
    const d = resolveRowDate(r, refDate);
    if (d) keys.add(keyOfDate(d));
  }
  return keys;
}

// Flat per-person list of assignment events.
// Returns Map(name -> [{ date, label, partner, family, meetingType }]) sorted by date.
export function collectPersonEvents(midweekWeeks, assignments, weekendRows, refDate = new Date(), getAssign) {
  const ga = getAssign ?? ((slotId, fallback) => (
    assignments && slotId in assignments ? assignments[slotId] : (fallback ?? '')
  ));
  const events = new Map();

  function push(name, date, label, partner, meetingType) {
    if (!name || !date) return;
    if (!events.has(name)) events.set(name, []);
    events.get(name).push({ date, label, partner: partner || null, family: isMinistryFamily(label), meetingType });
  }

  for (const week of midweekWeeks ?? []) {
    const date = resolveRowDate(week, refDate);
    if (!date) continue;

    push(ga(`mw${week.id}_chairman`, week.chairman), date, '主席', null, 'midweek');
    push(ga(`mw${week.id}_openPrayer`, week.openPrayer), date, '開始禱告', null, 'midweek');
    push(ga(`mw${week.id}_closePrayer`, week.closePrayer), date, '結束禱告', null, 'midweek');

    const allParts = [...(week.treasures ?? []), ...(week.ministry ?? []), ...(week.living ?? [])];
    for (const p of allParts) {
      const isPair = String(p.roleLabel ?? '').includes('/') && !p.hideHelper;
      const rls = p.roleLabel?.split('/') ?? [];
      // Slot IDs are `mw{weekId}_{partKey}_{n}` (see CLAUDE.md). `p.id` is the
      // bare partKey, so the week prefix is NOT optional: without it the lookup
      // never matched a live assignment and silently fell back to `p.assign`,
      // the snapshot loaded at mount — which is why edits only showed up here
      // after a page refresh.
      const a0 = ga(`mw${week.id}_${p.id}_0`, (p.assign ?? [])[0] ?? '');
      const a1 = isPair ? ga(`mw${week.id}_${p.id}_1`, (p.assign ?? [])[1] ?? '') : '';
      const base = p.cbsRef ? `${p.title}（${p.cbsRef}）` : p.title;
      if (isPair) {
        if (a0) push(a0, date, `${base}${rls[0] ? `（${rls[0]}）` : ''}`, a1 || null, 'midweek');
        if (a1) push(a1, date, `${base}（${rls[1] || '助手'}）`, a0 || null, 'midweek');
      } else if (a0) {
        const suffix = rls[0] ? `（${rls[0]}）` : '';
        push(a0, date, `${base}${suffix}`, null, 'midweek');
      }
    }
  }

  for (const row of weekendRows ?? []) {
    if (row.type === 'event' || row.type === 'suspended') continue;
    const date = resolveRowDate(row, refDate);
    if (!date) continue;
    if (row.speaker) push(row.speaker, date, '公眾演講', null, 'weekend');
    if (row.chair) push(row.chair, date, '週末聚會主席', null, 'weekend');
    if (row.wt) push(row.wt, date, '守望台主持', null, 'weekend');
    if (row.read) push(row.read, date, '守望台朗讀', null, 'weekend');
    if (row.host) push(row.host, date, '招待', null, 'weekend');
  }

  for (const list of events.values()) list.sort((a, b) => a.date - b.date);
  return events;
}

export function eventsByMonth(evts) {
  const map = new Map();
  for (const e of evts) {
    const k = keyOfDate(e.date);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return map;
}

function monthlyFor(evts, win, covered, isM) {
  const byMonth = eventsByMonth(evts);
  return win.map((m) => {
    const k = monthKey(m.year, m.month);
    const monthEvts = byMonth.get(k) ?? [];
    const flagEvts = isM ? monthEvts.filter((e) => e.family) : monthEvts;
    // Weeks-within-month, for the 3 個月 (weekly) display.
    const weeks = Array.from({ length: weeksInMonth(m.year, m.month) },
      (_, wi) => monthEvts.filter((e) => weekOfMonth(e.date) === wi));
    return {
      year: m.year, month: m.month, key: k,
      n: monthEvts.length, flagN: flagEvts.length,
      covered: covered.has(k), events: monthEvts, weeks,
    };
  });
}

// Sortable, filterable rows for the overview grid.
export function buildHeatmapRows(people, midweekWeeks, assignments, weekendRows, {
  gender = 'all', mode = 'rolling', range = 12, offset = 0, refDate = new Date(), getAssign,
} = {}) {
  const perPerson = collectPersonEvents(midweekWeeks, assignments, weekendRows, refDate, getAssign);
  const covered = coveredMonths(midweekWeeks, weekendRows, refDate);
  const win = buildMonthWindow({ mode, range, offset, refDate });

  const activePeople = (people ?? []).filter((p) => p.status !== 'inactive');
  const filtered = gender === 'all' ? activePeople : activePeople.filter((p) => p.g === gender);

  // Threshold scales with how much of the window we can actually judge — a
  // window that is mostly unloaded must not manufacture idle flags.
  const coveredCount = win.filter((m) => covered.has(monthKey(m.year, m.month))).length;
  const idleThreshold = Math.max(3, Math.round(coveredCount / 2));

  const rows = filtered.map((p) => {
    const evts = perPerson.get(p.name) ?? [];
    const isM = p.g === 'M';
    const monthly = monthlyFor(evts, win, covered, isM);
    const total = monthly.reduce((a, m) => a + m.n, 0);
    const dbl = monthly.filter((m) => m.flagN >= 2).length;
    // Only covered months count toward an idle run; an uncovered month neither
    // extends nor breaks it.
    let gap = 0, run = 0;
    monthly.forEach((m) => {
      if (!m.covered) return;
      if (m.n === 0) { run++; gap = Math.max(gap, run); } else run = 0;
    });
    const idle = coveredCount >= 3 && gap >= idleThreshold ? gap : 0;
    const rank = dbl ? 2 : idle ? 1 : 0;
    return { person: p, monthly, total, dbl, idle, rank };
  });

  rows.sort((a, b) => (b.rank - a.rank) || (b.dbl - a.dbl) || (b.idle - a.idle) || 0);

  // Week-level squares only make sense for the narrowest (3-month) window — at
  // 6 months the per-week grid runs to ~26 columns, wider than a phone (or even
  // the iPad card) can show without scrolling months out of view (member
  // feedback: "6個月 view overflows — just make it month blocks").
  return { rows, win, covered, monthMode: range !== 3 || mode === 'serviceYear', idleThreshold, coveredCount };
}

// Per-person detail for the 個人檢視 screen, over the SAME window as the grid
// so the two views can never disagree about what period is being shown.
export function buildPersonDetail(personName, gender, midweekWeeks, assignments, weekendRows, {
  mode = 'rolling', range = 12, offset = 0, refDate = new Date(), getAssign,
} = {}) {
  const perPerson = collectPersonEvents(midweekWeeks, assignments, weekendRows, refDate, getAssign);
  const covered = coveredMonths(midweekWeeks, weekendRows, refDate);
  const win = buildMonthWindow({ mode, range, offset, refDate });
  const winKeys = new Set(win.map((m) => monthKey(m.year, m.month)));
  const isM = gender === 'M';

  const all = perPerson.get(personName) ?? [];
  const evts = all.filter((e) => winKeys.has(keyOfDate(e.date))).sort((a, b) => a.date - b.date);

  const monthly = monthlyFor(evts, win, covered, isM);
  const doubleMonths = monthly.filter((m) => m.flagN >= 2);
  const flaggedKeys = new Set(doubleMonths.map((m) => m.key));

  const total = evts.length;
  const gapsDays = [];
  for (let i = 1; i < evts.length; i++) gapsDays.push(Math.round((evts[i].date - evts[i - 1].date) / 86400000));
  const avgGapWeeks = gapsDays.length ? gapsDays.reduce((a, b) => a + b, 0) / gapsDays.length / 7 : null;
  const maxGapWeeks = gapsDays.length ? Math.max(...gapsDays) / 7 : null;

  const records = evts.map((e) => ({
    date: `${e.date.getMonth() + 1}/${e.date.getDate()}`,
    year: e.date.getFullYear(),
    rawDate: e.date,
    label: e.label,
    partner: e.partner,
    flagged: flaggedKeys.has(keyOfDate(e.date)) && (!isM || e.family),
  }));

  const pairCounts = new Map();
  for (const e of evts) {
    if (e.partner) pairCounts.set(e.partner, (pairCounts.get(e.partner) ?? 0) + 1);
  }
  const pairings = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));

  return { evts, monthly, win, covered, total, avgGapWeeks, maxGapWeeks, records, pairings, doubleMonths, mode, range };
}

// Human label for the active window, e.g. "2026年3月 – 2027年2月" /
// "2025–2026 服務年度". The years are not decoration: rolling windows are
// CENTRED on the current month, so a 12-month window almost always crosses a
// year boundary and the year-less form read as a meaningless "3月 – 2月".
export function windowLabel(win, mode) {
  if (!win?.length) return '';
  if (mode === 'serviceYear') return `${win[0].year}–${win[win.length - 1].year} 服務年度`;
  const a = win[0], b = win[win.length - 1];
  if (a.year === b.year) return `${a.year}年${a.month}月 – ${b.month}月`;
  return `${a.year}年${a.month}月 – ${b.year}年${b.month}月`;
}

// Server/client-shared plain-language summary (so print + copy-to-text match).
export function buildPersonSummary(name, gender, detail) {
  const { total, avgGapWeeks, doubleMonths, win, mode } = detail;
  const period = mode === 'serviceYear' ? '這個服務年度' : `這 ${win?.length ?? 0} 個月`;
  if (total === 0) return `${name}在${period}目前沒有任何指派。`;
  const bucket = gender === 'M' ? '「用心準備傳道工作」相關的' : '';
  let s = `${name}在${period}共有 ${total} 份指派`;
  if (avgGapWeeks != null) s += `，平均每 ${avgGapWeeks.toFixed(1)} 週一次`;
  s += '。';
  if (doubleMonths.length > 0) {
    const parts = doubleMonths.map((m) => `${m.month}月`).join('、');
    s += `唯一的例外是${parts}，同一個月內有${bucket}兩份以上，超出同一個月一份的原則。`;
  } else {
    s += `分布大致平均，沒有同一個月${bucket}重複兩份以上的情形。`;
  }
  return s;
}

// ─── Export rows ──────────────────────────────────────────────────────────────
// Pure row/text builders for the 匯出 menu. They live here, next to the
// derivation they render, so the on-screen grid, the copied text and the
// spreadsheet can never disagree — the same reason buildPersonSummary is here
// rather than in the component. app/lib/heatmapExport.js is the thin browser
// layer that turns these into a downloaded file.

// The 需要注意 note shown on a grid row, in one place for screen + exports.
export function attentionNote(row) {
  if (row.dbl) return `同月 ${row.dbl} 次重複`;
  if (row.idle) return `${row.idle} 個月未派`;
  return '';
}

const GENDER_LABEL = (g) => (g === 'F' ? '姊妹' : '弟兄');

// Grid → array-of-arrays, ready for buildXlsxBuffer. One row per person, one
// column per month; an uncovered month is '—' (no meetings imported) rather
// than 0, matching what the grid renders as 無資料.
export function buildGridExportRows(data, mode) {
  const { rows, win } = data;
  const header = ['姓名', '性別', ...win.map((m) => `${m.year}年${m.month}月`), '件數', '需要注意'];
  const body = rows.map((r) => [
    r.person.name,
    GENDER_LABEL(r.person.g),
    ...r.monthly.map((m) => (m.covered ? String(m.n) : '—')),
    String(r.total),
    attentionNote(r),
  ]);
  return [
    ['指派分布', windowLabel(win, mode)],
    [],
    header,
    ...body,
  ];
}

export function buildGridText(data, mode) {
  const { rows, win } = data;
  const lines = [
    '指派分布',
    `${windowLabel(win, mode)} · ${rows.length} 位`,
    '',
  ];
  for (const r of rows) {
    const months = r.monthly
      .filter((m) => m.covered && m.n > 0)
      .map((m) => `${m.month}月×${m.n}`)
      .join(' ');
    const note = attentionNote(r);
    lines.push(
      `${r.person.name}（${r.person.g === 'F' ? '姊' : '兄'}）　${r.total} 份`
      + (months ? `　${months}` : '')
      + (note ? `　⚠ ${note}` : '')
    );
  }
  return lines.join('\n');
}

// Person detail → array-of-arrays. Full dates: M/D alone is ambiguous once the
// window crosses a year boundary, which the centred window usually does.
export function buildPersonExportRows(name, gender, detail) {
  const rows = [
    [`${name}（${GENDER_LABEL(gender)}）`, windowLabel(detail.win, detail.mode)],
    [buildPersonSummary(name, gender, detail)],
    [],
    ['期間件數', String(detail.total)],
    ['平均間隔', detail.avgGapWeeks != null ? `${detail.avgGapWeeks.toFixed(1)} 週` : '—'],
    ['最長間隔', detail.maxGapWeeks != null ? `${Math.round(detail.maxGapWeeks)} 週` : '—'],
    ['同月重複', detail.doubleMonths.length
      ? `${detail.doubleMonths.length} 次（${detail.doubleMonths.map((m) => `${m.month}月`).join('、')}）`
      : '無'],
    [],
    ['日期', '項目', '搭檔'],
  ];
  for (const r of detail.records) {
    const d = r.rawDate;
    rows.push([`${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`, r.label, r.partner ?? '']);
  }
  return rows;
}
