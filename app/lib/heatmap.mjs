// Pure, DB-free helpers for the 指派分布 (assignment distribution heatmap) on
// the Overview page. No React, no fetch — testable with `node --test`.
//
// Time axis is the congregation's SERVICE YEAR: September through August.
// `serviceYearStartYear(refDate)` picks the September that the reference date
// falls inside/after, so "today" always lands somewhere in the 12-month window.
//
// Rules encoded here (from member feedback, see CLAUDE.md 指派分布 section):
//   - 姊妹: should not have two parts in the same calendar month (any type).
//   - 弟兄: should not appear twice in the same month within the
//     用心準備傳道工作 bucket — 傳道示範 / 傳道演講 / 助手 / 經文朗讀,
//     treated as one bucket (matched by substring on the assembled label).
//   - Counting: 1 part = 1 count, no weighting by part type.
//   - Idle flag: a zero-assignment run of at least max(3, round(visibleMonths/2))
//     months within the visible window (window-relative, not calendar-absolute).

export const SERVICE_MONTH_ORDER = [9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8];

const MINISTRY_FAMILY_MARKERS = ['傳道示範', '傳道演講', '助手', '經文朗讀'];

function isMinistryFamily(label) {
  const s = String(label ?? '');
  return MINISTRY_FAMILY_MARKERS.some((m) => s.includes(m));
}

// The September that starts the service year containing refDate.
export function serviceYearStartYear(refDate = new Date()) {
  const m = refDate.getMonth() + 1; // 1-12
  return m >= 9 ? refDate.getFullYear() : refDate.getFullYear() - 1;
}

export function serviceYearStartDate(startYear) {
  return new Date(startYear, 8, 1); // Sept 1
}

// Parse "6月 3日" / "8/9" into a Date, resolving the year from which side of
// the Sept/Aug boundary the month falls on — exact, unlike the ±6-month
// inference other parsers use (this window spans a full 12 months, so a
// proximity guess would be ambiguous).
export function parseServiceYearDate(str, startYear) {
  const s = String(str ?? '');
  const m = s.match(/(\d+)月\s*(\d+)日/) ?? s.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (!month || !day) return null;
  const year = month >= 9 ? startYear : startYear + 1;
  return new Date(year, month - 1, day);
}

export function weekIndexOf(date, startYear) {
  const start = serviceYearStartDate(startYear);
  return Math.floor((date - start) / (7 * 86400000));
}

// 52 synthetic weeks anchored on the service year's Thursdays, used only to
// group events into month bands for the grid — not a claim about the exact
// real-world meeting week boundaries.
export function buildWeeksMeta(startYear) {
  const weeks = [];
  for (let i = 0; i < 52; i++) {
    const anchor = new Date(startYear, 8, 1 + i * 7 + 3);
    weeks.push({ i, month: anchor.getMonth() + 1, year: anchor.getFullYear() });
  }
  return weeks;
}

export function monthBands(weeksMeta) {
  const months = [];
  weeksMeta.forEach((w) => {
    const last = months[months.length - 1];
    if (last && last.month === w.month && last.year === w.year) last.weekIdxs.push(w.i);
    else months.push({ month: w.month, year: w.year, weekIdxs: [w.i] });
  });
  return months;
}

// Build a flat per-person list of assignment events for one service year.
// Returns Map(name -> [{ date, label, partner, family, meetingType }]) sorted by date.
export function collectPersonEvents(midweekWeeks, assignments, weekendRows, startYear, getAssign) {
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
    const date = parseServiceYearDate(week.date, startYear);
    if (!date) continue;

    push(ga(`mw${week.id}_chairman`, week.chairman), date, '主席', null, 'midweek');
    push(ga(`mw${week.id}_openPrayer`, week.openPrayer), date, '開始禱告', null, 'midweek');
    push(ga(`mw${week.id}_closePrayer`, week.closePrayer), date, '結束禱告', null, 'midweek');

    const allParts = [...(week.treasures ?? []), ...(week.ministry ?? []), ...(week.living ?? [])];
    for (const p of allParts) {
      const isPair = String(p.roleLabel ?? '').includes('/') && !p.hideHelper;
      const rls = p.roleLabel?.split('/') ?? [];
      const a0 = ga(`${p.id}_0`, (p.assign ?? [])[0] ?? '');
      const a1 = isPair ? ga(`${p.id}_1`, (p.assign ?? [])[1] ?? '') : '';
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
    const date = parseServiceYearDate(row.date, startYear);
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

export function eventsByWeek(evts, startYear) {
  const map = new Map();
  for (const e of evts) {
    const wi = weekIndexOf(e.date, startYear);
    if (!map.has(wi)) map.set(wi, []);
    map.get(wi).push(e);
  }
  return map;
}

function monthlyFor(evts, win, startYear, isM) {
  const byWeek = eventsByWeek(evts, startYear);
  return win.map((m) => {
    const monthEvts = m.weekIdxs.flatMap((wi) => byWeek.get(wi) ?? []);
    const flagEvts = isM ? monthEvts.filter((e) => e.family) : monthEvts;
    return { month: m.month, year: m.year, n: monthEvts.length, flagN: flagEvts.length, weekIdxs: m.weekIdxs, events: monthEvts };
  });
}

// Sortable, filterable rows for the overview grid.
// gender: 'all' | 'F' | 'M'; range: 3 | 6 | 12; offset: months back from the
// end of the service year (0 = most recent).
export function buildHeatmapRows(people, midweekWeeks, assignments, weekendRows, {
  gender = 'all', range = 12, offset = 0, refDate = new Date(), getAssign,
} = {}) {
  const startYear = serviceYearStartYear(refDate);
  const perPerson = collectPersonEvents(midweekWeeks, assignments, weekendRows, startYear, getAssign);
  const weeksMeta = buildWeeksMeta(startYear);
  const months = monthBands(weeksMeta);

  const endIdx = months.length - offset;
  const startIdx = Math.max(0, endIdx - range);
  const win = months.slice(startIdx, endIdx);

  const activePeople = (people ?? []).filter((p) => p.status !== 'inactive');
  const filtered = gender === 'all' ? activePeople : activePeople.filter((p) => p.g === gender);
  const idleThreshold = Math.max(3, Math.round(win.length / 2));

  const rows = filtered.map((p) => {
    const evts = perPerson.get(p.name) ?? [];
    const isM = p.g === 'M';
    const monthly = monthlyFor(evts, win, startYear, isM);
    const total = monthly.reduce((a, m) => a + m.n, 0);
    const dbl = monthly.filter((m) => m.flagN >= 2).length;
    let gap = 0, run = 0;
    monthly.forEach((m) => { if (m.n === 0) { run++; gap = Math.max(gap, run); } else run = 0; });
    const idle = gap >= idleThreshold ? gap : 0;
    const rank = dbl ? 2 : idle ? 1 : 0;
    return { person: p, monthly, total, dbl, idle, rank, byWeek: eventsByWeek(evts, startYear) };
  });

  rows.sort((a, b) => (b.rank - a.rank) || (b.dbl - a.dbl) || (b.idle - a.idle) || 0);

  return { rows, win, weeksMeta, monthMode: range === 12, startYear, idleThreshold };
}

// Full-year detail for one person (used by the 個人檢視 screen).
export function buildPersonDetail(personName, gender, midweekWeeks, assignments, weekendRows, {
  refDate = new Date(), getAssign,
} = {}) {
  const startYear = serviceYearStartYear(refDate);
  const perPerson = collectPersonEvents(midweekWeeks, assignments, weekendRows, startYear, getAssign);
  const evts = (perPerson.get(personName) ?? []).slice().sort((a, b) => a.date - b.date);
  const weeksMeta = buildWeeksMeta(startYear);
  const months = monthBands(weeksMeta);
  const isM = gender === 'M';

  const monthly = monthlyFor(evts, months, startYear, isM);
  const flaggedMonths = new Set(monthly.filter((m) => m.flagN >= 2).map((m) => `${m.year}-${m.month}`));
  const doubleMonths = monthly.filter((m) => m.flagN >= 2);

  const total = evts.length;
  const gapsDays = [];
  for (let i = 1; i < evts.length; i++) gapsDays.push(Math.round((evts[i].date - evts[i - 1].date) / 86400000));
  const avgGapWeeks = gapsDays.length ? gapsDays.reduce((a, b) => a + b, 0) / gapsDays.length / 7 : null;
  const maxGapWeeks = gapsDays.length ? Math.max(...gapsDays) / 7 : null;

  const records = evts.map((e) => ({
    date: `${e.date.getMonth() + 1}/${e.date.getDate()}`,
    rawDate: e.date,
    label: e.label,
    partner: e.partner,
    flagged: flaggedMonths.has(`${e.date.getFullYear()}-${e.date.getMonth() + 1}`) && (!isM || e.family),
  }));

  const pairCounts = new Map();
  for (const e of evts) {
    if (e.partner) pairCounts.set(e.partner, (pairCounts.get(e.partner) ?? 0) + 1);
  }
  const pairings = [...pairCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));

  return { evts, monthly, months, weeksMeta, total, avgGapWeeks, maxGapWeeks, records, pairings, doubleMonths, startYear };
}

// Server/client-shared plain-language summary (so print + copy-to-text match).
export function buildPersonSummary(name, gender, detail) {
  const { total, avgGapWeeks, doubleMonths } = detail;
  const genderWord = gender === 'F' ? '姊妹' : '弟兄';
  if (total === 0) return `${name}在這個服務年度目前沒有任何指派。`;
  const bucket = gender === 'M' ? '「用心準備傳道工作」相關的' : '';
  let s = `${name}在這個服務年度共有 ${total} 份指派`;
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
