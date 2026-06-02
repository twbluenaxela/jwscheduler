// Pure, DB-free assignment/date helpers shared by the LINE webhook
// (`我的安排` individual query) and meetings/publish (LINE diff).
// Framework-free on purpose so it can be unit-tested with `node --test`
// — see assignments.test.mjs.
//
// `now`/`today` are injectable for deterministic tests; routes call with defaults.

function startOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Parse a Chinese "6月 3日" or slash "8/9" date string into a JS Date, inferring
// the year within a ±6-month window around `now` to handle year boundaries.
export function parseCnDate(dateStr, now = new Date()) {
  const text = String(dateStr ?? '');
  const cn = text.match(/(\d+)月\s*(\d+)日/);
  if (cn) {
    let year = now.getFullYear();
    const mo = parseInt(cn[1]);
    if (mo < now.getMonth() + 1 - 6) year++;
    else if (mo > now.getMonth() + 1 + 6) year--;
    return new Date(year, mo - 1, parseInt(cn[2]));
  }
  const slash = text.match(/^(\d+)\/(\d+)$/);
  if (slash) {
    let year = now.getFullYear();
    const mo = parseInt(slash[1]);
    if (mo < now.getMonth() + 1 - 6) year++;
    else if (mo > now.getMonth() + 1 + 6) year--;
    return new Date(year, mo - 1, parseInt(slash[2]));
  }
  return null;
}

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
    const d = parseCnDate(week.date, now);
    if (!d || d < cutoff) continue;
    const aMap = new Map((week.assignments ?? []).map((a) => [a.slotId, a.name]));
    if (aMap.get(`mw${week.id}_chairman`) === name) items.push({ date: week.date, role: '主席' });
    if (aMap.get(`mw${week.id}_openPrayer`) === name) items.push({ date: week.date, role: '開始禱告' });
    if (aMap.get(`mw${week.id}_closePrayer`) === name) items.push({ date: week.date, role: '結束禱告' });
    for (const part of week.parts ?? []) {
      const rls = part.roleLabel?.split('/') ?? [];
      const base = part.cbsRef ? `${part.title}（${part.cbsRef}）` : part.title;
      if (aMap.get(`mw${week.id}_${part.partKey}_0`) === name)
        items.push({ date: week.date, role: rls[0] ? `${base}（${rls[0]}）` : base });
      if (aMap.get(`mw${week.id}_${part.partKey}_1`) === name)
        items.push({ date: week.date, role: `${base}（${rls[1] ?? '助手'}）` });
    }
  }

  for (const row of weekendRows ?? []) {
    if (row.type === 'event' || (skipSuspended && row.type === 'suspended')) continue;
    const d = parseCnDate(row.date, now);
    if (!d || d < cutoff) continue;
    if (row.speaker === name) items.push({ date: row.date, role: '公眾演講' });
    if (row.chair === name) items.push({ date: row.date, role: '主席' });
    if (row.wt === name) items.push({ date: row.date, role: '守望台主持' });
    if (row.read === name) items.push({ date: row.date, role: '朗讀' });
    if (row.host === name) items.push({ date: row.date, role: '招待' });
  }

  items.sort((a, b) => (parseCnDate(a.date, now) ?? 0) - (parseCnDate(b.date, now) ?? 0));
  return items;
}

export function itemKey(item) { return `${item.date}|${item.role}`; }
