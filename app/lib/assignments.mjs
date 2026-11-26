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
// matching the UI's PairSlot labels. Each item also carries the `slotId` it came
// from, so a rename (title edit) can be recognised as the same slot with a new
// role text instead of a cancellation plus a new assignment. `itemKey` stays
// `date|role` so snapshots written before slotId existed still diff correctly.
//
// A part with `hideHelper` true (the 主持/朗讀 pair toggle) must not report its
// `_1` slot: the row may still be in the DB from before the toggle, but the UI
// does not show it, so neither the notification nor 我的安排 may list it.
export function collectAssignments(name, weeks, weekendRows, { today, now = new Date(), skipSuspended = false } = {}) {
  const cutoff = today ?? startOfToday(now);
  const items = [];

  for (const week of weeks ?? []) {
    const d = resolveRowDate(week, now);
    if (!d || d < cutoff) continue;
    const aMap = new Map((week.assignments ?? []).map((a) => [a.slotId, a.name]));
    const fixed = [
      ['chairman', '主席'],
      ['openPrayer', '開始禱告'],
      ['closePrayer', '結束禱告'],
    ];
    for (const [field, role] of fixed) {
      const slotId = `mw${week.id}_${field}`;
      if (aMap.get(slotId) === name) items.push({ date: week.date, _d: d, role, slotId });
    }
    for (const part of week.parts ?? []) {
      const rls = part.roleLabel?.split('/') ?? [];
      const base = part.cbsRef ? `${part.title}（${part.cbsRef}）` : part.title;
      const slot0 = `mw${week.id}_${part.partKey}_0`;
      if (aMap.get(slot0) === name)
        items.push({ date: week.date, _d: d, role: rls[0] ? `${base}（${rls[0]}）` : base, slotId: slot0 });
      if (part.hideHelper) continue;
      const slot1 = `mw${week.id}_${part.partKey}_1`;
      if (aMap.get(slot1) === name)
        items.push({ date: week.date, _d: d, role: `${base}（${rls[1] ?? '助手'}）`, slotId: slot1 });
    }
  }

  for (const row of weekendRows ?? []) {
    if (row.type === 'event' || (skipSuspended && row.type === 'suspended')) continue;
    const d = resolveRowDate(row, now);
    if (!d || d < cutoff) continue;
    const fields = [
      ['speaker', '公眾演講'],
      ['chair', '主席'],
      ['wt', '守望台主持'],
      ['read', '朗讀'],
      ['host', '招待'],
    ];
    for (const [field, role] of fields) {
      if (row[field] === name) items.push({ date: row.date, _d: d, role, slotId: `we${row.id}_${field}` });
    }
  }

  // Sort on the resolved dates captured above — re-parsing the year-less
  // display string here would re-introduce the ambiguity we just removed.
  items.sort((a, b) => (a._d ?? 0) - (b._d ?? 0));
  return items.map(({ _d, ...rest }) => rest);
}

export function itemKey(item) { return `${item.date}|${item.role}`; }
