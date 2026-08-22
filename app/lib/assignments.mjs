// Pure, DB-free assignment/date helpers shared by the LINE webhook
// (`我的安排` individual query) and meetings/publish (LINE diff).
// Framework-free on purpose so it can be unit-tested with `node --test`
// — see assignments.test.mjs.
//
// `now`/`today` are injectable for deterministic tests; routes call with defaults.

import { parseCnDate, resolveRowDate } from './cnDate.mjs';

function startOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Dates come from `cnDate.mjs` — this module used to carry its own copy of the
// ±6-month year inference, which is exactly how two parsers drift apart.
// `parseCnDate` is re-exported because the routes and tests import it from here.
export { parseCnDate };

// All future (date >= today) assignments for one person, across midweek weeks
// and weekend rows, sorted by date. Event weekend rows are always skipped;
// suspended rows are skipped only when `skipSuspended` is set (the webhook query
// does; meetings/publish keeps its original behaviour and includes them).
// Roles carry their role label (學生/助手/主持/朗讀) and CBS textbook reference,
// matching the UI's PairSlot labels.
export function collectAssignments(name, weeks, weekendRows, { today, now = new Date(), skipSuspended = false } = {}) {
  const cutoff = today ?? startOfToday(now);
  const items = [];

  for (const week of weeks ?? []) {
    const d = resolveRowDate(week, now);
    if (!d || d < cutoff) continue;
    const aMap = new Map((week.assignments ?? []).map((a) => [a.slotId, a.name]));
    if (aMap.get(`mw${week.id}_chairman`) === name) items.push({ date: week.date, role: '主席' });
    if (aMap.get(`mw${week.id}_openPrayer`) === name) items.push({ date: week.date, _d: d, role: '開始禱告' });
    if (aMap.get(`mw${week.id}_closePrayer`) === name) items.push({ date: week.date, _d: d, role: '結束禱告' });
    for (const part of week.parts ?? []) {
      const rls = part.roleLabel?.split('/') ?? [];
      const base = part.cbsRef ? `${part.title}（${part.cbsRef}）` : part.title;
      if (aMap.get(`mw${week.id}_${part.partKey}_0`) === name)
        items.push({ date: week.date, _d: d, role: rls[0] ? `${base}（${rls[0]}）` : base });
      if (aMap.get(`mw${week.id}_${part.partKey}_1`) === name)
        items.push({ date: week.date, _d: d, role: `${base}（${rls[1] ?? '助手'}）` });
    }
  }

  for (const row of weekendRows ?? []) {
    if (row.type === 'event' || (skipSuspended && row.type === 'suspended')) continue;
    const d = resolveRowDate(row, now);
    if (!d || d < cutoff) continue;
    if (row.speaker === name) items.push({ date: row.date, _d: d, role: '公眾演講' });
    if (row.chair === name) items.push({ date: row.date, _d: d, role: '主席' });
    if (row.wt === name) items.push({ date: row.date, _d: d, role: '守望台主持' });
    if (row.read === name) items.push({ date: row.date, _d: d, role: '朗讀' });
    if (row.host === name) items.push({ date: row.date, _d: d, role: '招待' });
  }

  // Sort on the resolved dates captured above — re-parsing the year-less
  // display string here would re-introduce the ambiguity we just removed.
  items.sort((a, b) => (a._d ?? 0) - (b._d ?? 0));
  return items.map(({ _d, ...rest }) => rest);
}

export function itemKey(item) { return `${item.date}|${item.role}`; }
