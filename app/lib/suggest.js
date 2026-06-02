// Pure suggestion engine — no DB, no fetch, no React.
// People input shape: { name, g, quals: string[], status }
// History input shape: { name, date }[]
//
// Tag + gender requirements come from CATS (data/index.js) — the SAME source of
// truth the people picker (AssignSheet) uses — so the ✦ suggest button and the
// candidate sheet always agree on who is eligible. (Do NOT re-introduce a private
// CAT_REQS table with the legacy 主席 tag — it was split into 傳道與生活主席 /
// 週末聚會主席 / 守望台主持人 and no member carries 主席 anymore.)
import { CATS } from '../data/index.js';

const CAT_REQS = Object.fromEntries(
  Object.entries(CATS).map(([k, v]) => [k, { tag: v.tag, g: v.g }])
);

// Year is inferred relative to `ref` (the slot being assigned) with a ±6-month
// window — matches pastHistory.mjs so the picker and suggest engine parse alike.
function parseDate(str, ref = new Date()) {
  const s = String(str ?? '');
  const m = s.match(/(\d+)月\s*(\d+)日/) ?? s.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  let yr = ref.getFullYear();
  const mo = +m[1];
  if (mo > ref.getMonth() + 7) yr--;
  else if (mo < ref.getMonth() - 5) yr++;
  return new Date(yr, mo - 1, +m[2]);
}

// Returns candidates sorted: longest gap desc, then fewest total asc.
// daysSince + the past filter are measured from `ref` (the slot's meeting date),
// so only assignments STRICTLY BEFORE the slot count — matching the picker.
function rankCandidates(people, tag, gender, history, ref) {
  const eligible = people.filter(p =>
    p.status === 'active' &&
    (p.quals ?? []).includes(tag) &&
    (gender === 'any' || p.g === gender)
  );

  const refMs = ref.getTime();
  const lastSeen = new Map();
  const counts = new Map();
  for (const h of history) {
    if (!h.name) continue;
    const d = parseDate(h.date, ref);
    if (!d || d.getTime() >= refMs) continue; // strictly before the slot date
    const prev = lastSeen.get(h.name);
    if (!prev || d > prev) lastSeen.set(h.name, d);
    counts.set(h.name, (counts.get(h.name) ?? 0) + 1);
  }

  return eligible
    .map(p => ({
      name: p.name,
      daysSince: lastSeen.has(p.name)
        ? Math.floor((refMs - lastSeen.get(p.name)) / 86400000)
        : 9999,
      count: counts.get(p.name) ?? 0,
    }))
    .sort((a, b) => b.daysSince - a.daysSince || a.count - b.count);
}

function toRef(refDate) {
  if (refDate instanceof Date) return refDate;
  return parseDate(refDate) ?? new Date();
}

function pickOne(ranked, used) {
  for (const c of ranked) {
    if (!used.has(c.name)) {
      used.add(c.name);
      return c.name;
    }
  }
  return null;
}

// Suggest speaker, chair, wt, read for a weekend row.
// existing: already-filled fields to exclude from suggestions.
// refDate: the row's meeting date (Date or date-string); defaults to today.
export function suggestWeekendRow(people, pastRows, existing = {}, refDate = new Date()) {
  const ref = toRef(refDate);
  const used = new Set(Object.values(existing).filter(Boolean));
  const hist = {
    speaker: pastRows.filter(r => r.speaker).map(r => ({ name: r.speaker, date: r.date })),
    chair:   pastRows.filter(r => r.chair).map(r => ({ name: r.chair,   date: r.date })),
    wt:      pastRows.filter(r => r.wt).map(r => ({ name: r.wt,         date: r.date })),
    read:    pastRows.filter(r => r.read).map(r => ({ name: r.read,      date: r.date })),
  };
  const rank = (catKey, history) => {
    const req = CAT_REQS[catKey];
    return rankCandidates(people, req.tag, req.g, history, ref);
  };
  return {
    speaker: pickOne(rank('publictalk',   hist.speaker), used),
    chair:   pickOne(rank('weekendchair', hist.chair),   used),
    wt:      pickOne(rank('wt',           hist.wt),      used),
    read:    pickOne(rank('wtread',       hist.read),    used),
  };
}

// Suggest assignments for all empty slots in a midweek week.
// week: { id, treasures, ministry, living } frontend shape (parts have .id = partKey, .cat, .roleLabel)
// existingAssignments: { [slotId]: name } — already confirmed slots
// pastHistory: [{ name, cat, date }]
export function suggestMidweekWeek(people, week, existingAssignments, pastHistory, refDate = new Date()) {
  const ref = toRef(refDate);
  const wId = `mw${week.id}`;
  const used = new Set(Object.values(existingAssignments).filter(Boolean));
  const result = {};

  const histByCat = {};
  for (const h of pastHistory) {
    (histByCat[h.cat] ??= []).push({ name: h.name, date: h.date });
  }

  const suggest = (slotId, catKey) => {
    if (existingAssignments[slotId]) return;
    const req = CAT_REQS[catKey];
    if (!req) return;
    const name = pickOne(rankCandidates(people, req.tag, req.g, histByCat[catKey] ?? [], ref), used);
    if (name) result[slotId] = name;
  };

  suggest(`${wId}_chairman`,   'chairman');
  suggest(`${wId}_openPrayer`, 'prayer');
  suggest(`${wId}_closePrayer`, 'prayer');

  for (const section of ['treasures', 'ministry', 'living']) {
    for (const part of week[section] ?? []) {
      suggest(`${wId}_${part.id}_0`, part.cat);
      if (String(part.roleLabel ?? '').includes('/')) {
        suggest(`${wId}_${part.id}_1`, part.cat);
      }
    }
  }

  return result;
}
