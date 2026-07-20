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
import { partTypeOf, effectiveCat, slotCat } from './partTypes.mjs';

const CAT_REQS = Object.fromEntries(
  Object.entries(CATS).map(([k, v]) => [k, { tag: v.tag, g: v.g }])
);

// How many top-fairness candidates to consider when rotating part types.
// Within this window the person who has gone longest without doing THIS
// specific part type + role wins, so nobody gets stuck with e.g. 初次交談
// or the 助手 role forever while overall fairness stays dominant.
const ROTATE_WINDOW = 5;

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

// Returns candidates sorted: widest gap desc, then fewest total asc.
// The gap is BIDIRECTIONAL — the distance from `ref` (the slot's meeting date)
// to the candidate's nearest assignment in EITHER direction. Someone already
// booked 7 days AFTER the slot is exactly as loaded as someone who served
// 7 days before it, so editing an earlier week can't double-book a person who
// is already scheduled in an upcoming week. Assignments dated on `ref` itself
// are the meeting being planned (its other slots are handled by `used`).
function rankCandidates(people, tag, gender, history, ref) {
  const eligible = people.filter(p =>
    p.status === 'active' &&
    (p.quals ?? []).includes(tag) &&
    (gender === 'any' || p.g === gender)
  );

  const refMs = ref.getTime();
  const lastSeen = new Map();
  const nextSeen = new Map();
  const counts = new Map();
  for (const h of history) {
    if (!h.name) continue;
    const d = parseDate(h.date, ref);
    if (!d || d.getTime() === refMs) continue;
    if (d.getTime() < refMs) {
      const prev = lastSeen.get(h.name);
      if (!prev || d > prev) lastSeen.set(h.name, d);
    } else {
      const next = nextSeen.get(h.name);
      if (!next || d < next) nextSeen.set(h.name, d);
    }
    counts.set(h.name, (counts.get(h.name) ?? 0) + 1);
  }

  return eligible
    .map(p => {
      const daysSince = lastSeen.has(p.name)
        ? Math.floor((refMs - lastSeen.get(p.name).getTime()) / 86400000)
        : 9999;
      const daysUntil = nextSeen.has(p.name)
        ? Math.floor((nextSeen.get(p.name).getTime() - refMs) / 86400000)
        : 9999;
      return { name: p.name, gap: Math.min(daysSince, daysUntil), count: counts.get(p.name) ?? 0 };
    })
    .sort((a, b) => b.gap - a.gap || a.count - b.count);
}

// Names with an assignment in ANY category within ±CROWD_WINDOW_DAYS of the
// slot (other than the meeting itself). They are demoted below everyone who is
// free around that date — but stay pickable, so slots still fill when the
// whole pool is busy.
const CROWD_WINDOW_DAYS = 7;

// Ministry student-practice parts (傳道示範 pairs + single-slot 演講 talks) get
// their own, much wider demotion window: per member feedback, the same
// student/helper should not repeat within roughly the same month whenever the
// pool allows it. This is on top of (not instead of) the 7-day crowd window,
// and — like crowd demotion generally — it only demotes, never excludes, so a
// small pool still fills every slot.
const MONTHLY_REPEAT_WINDOW_DAYS = 28;
const MONTHLY_REPEAT_CATS = new Set(['ministry', 'ministrytalk']);

function crowdedNames(entries, ref, windowDays = CROWD_WINDOW_DAYS) {
  const refMs = ref.getTime();
  const win = windowDays * 86400000;
  const out = new Set();
  for (const h of entries) {
    if (!h.name) continue;
    const d = parseDate(h.date, ref);
    if (!d) continue;
    const diff = Math.abs(d.getTime() - refMs);
    if (diff !== 0 && diff <= win) out.add(h.name);
  }
  return out;
}

function demoteCrowded(ranked, crowded) {
  if (!crowded.size) return ranked;
  return [...ranked.filter(c => !crowded.has(c.name)), ...ranked.filter(c => crowded.has(c.name))];
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

// Fairness-first pick with part-type rotation and optional gender preference.
// - preferG: helper slots prefer the student's gender (S-38: assistant should
//   be of the same sex) but fall back to anyone rather than leave a blank.
// - type/role: among the top ROTATE_WINDOW by fairness, pick whoever has gone
//   longest without this specific (type, role) — never-done beats any date.
function pickRotated(ranked, used, { type, role, typeRoleLast, preferG, genderOf, crowded } = {}) {
  let avail = ranked.filter(c => !used.has(c.name));
  if (preferG && genderOf) {
    const same = avail.filter(c => genderOf(c.name) === preferG);
    if (same.length) avail = same;
  }
  // Crowded names must not re-enter via the rotation window while free
  // candidates exist — only fall back to them when nobody else is left.
  // Applied AFTER the gender preference: a same-gender helper who is busy
  // nearby still beats switching gender (S-38 outranks load-spreading).
  if (crowded?.size) {
    const free = avail.filter(c => !crowded.has(c.name));
    if (free.length) avail = free;
  }
  if (!avail.length) return null;
  let best = avail[0];
  if (type && typeRoleLast) {
    const pool = avail.slice(0, ROTATE_WINDOW);
    best = pool.reduce((a, b) => {
      const la = typeRoleLast.get(`${a.name}|${type}|${role}`) ?? -1;
      const lb = typeRoleLast.get(`${b.name}|${type}|${role}`) ?? -1;
      return lb < la ? b : a; // strictly older (or never) wins; tie keeps fairness order
    });
  }
  used.add(best.name);
  return best.name;
}

// Suggest speaker, chair, wt, read for a weekend row.
// existing: already-filled fields to exclude from suggestions.
// pastRows: ALL schedule rows — past AND future (future bookings count against
//   a candidate via the bidirectional gap + crowd demotion).
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
  const crowded = crowdedNames([...hist.speaker, ...hist.chair, ...hist.wt, ...hist.read], ref);
  const rank = (catKey, history) => {
    const req = CAT_REQS[catKey];
    return demoteCrowded(rankCandidates(people, req.tag, req.g, history, ref), crowded);
  };
  return {
    speaker: pickOne(rank('publictalk',   hist.speaker), used),
    chair:   pickOne(rank('weekendchair', hist.chair),   used),
    wt:      pickOne(rank('wt',           hist.wt),      used),
    read:    pickOne(rank('wtread',       hist.read),    used),
  };
}

// Suggest assignments for all empty slots in a midweek week.
// week: { id, treasures, ministry, living } frontend shape (parts have .id = partKey, .cat, .roleLabel, .title)
// existingAssignments: { [slotId]: name } — already confirmed slots
// pastHistory: [{ name, cat, date, type?, role? }] — ALL other weeks, past AND
//   future (upcoming bookings count against a candidate via the bidirectional
//   gap + crowd demotion). cat is the EFFECTIVE cat (ministry talks under
//   'ministrytalk'); type/role enable part-type rotation and are optional
//   (old-shape entries still count toward overall fairness).
export function suggestMidweekWeek(people, week, existingAssignments, pastHistory, refDate = new Date()) {
  const ref = toRef(refDate);
  const refMs = ref.getTime();
  const wId = `mw${week.id}`;
  const used = new Set(Object.values(existingAssignments).filter(Boolean));
  const result = {};
  const genderByName = new Map(people.map(p => [p.name, p.g]));
  const genderOf = (name) => genderByName.get(name);

  const histByCat = {};
  // `${name}|${type}|${role}` -> latest ms. FUTURE entries count too: someone
  // already booked for 初次交談 next week is the MOST recent holder of that
  // part type, not "never did it" — otherwise the rotation window would
  // resurrect exactly the person the bidirectional gap just pushed down.
  const typeRoleLast = new Map();
  for (const h of pastHistory) {
    (histByCat[h.cat] ??= []).push({ name: h.name, date: h.date });
    if (h.type && h.role != null) {
      const d = parseDate(h.date, ref);
      if (!d || d.getTime() === refMs) continue;
      const k = `${h.name}|${h.type}|${h.role}`;
      const prev = typeRoleLast.get(k);
      if (prev == null || d.getTime() > prev) typeRoleLast.set(k, d.getTime());
    }
  }

  const crowded = crowdedNames(pastHistory, ref);
  const monthlyRepeat = crowdedNames(
    pastHistory.filter(h => MONTHLY_REPEAT_CATS.has(h.cat)),
    ref,
    MONTHLY_REPEAT_WINDOW_DAYS,
  );
  const suggest = (slotId, catKey, opts = {}) => {
    if (existingAssignments[slotId]) return;
    const req = CAT_REQS[catKey];
    if (!req) return;
    // Student-practice cats add the monthly-repeat set on top of the regular
    // 7-day crowd window (see MONTHLY_REPEAT_WINDOW_DAYS above).
    const effCrowded = MONTHLY_REPEAT_CATS.has(catKey)
      ? new Set([...crowded, ...monthlyRepeat])
      : crowded;
    const ranked = demoteCrowded(rankCandidates(people, req.tag, req.g, histByCat[catKey] ?? [], ref), effCrowded);
    const name = pickRotated(ranked, used, { ...opts, typeRoleLast, genderOf, crowded: effCrowded });
    if (name) result[slotId] = name;
  };

  suggest(`${wId}_chairman`,   'chairman');
  suggest(`${wId}_openPrayer`, 'prayer');
  suggest(`${wId}_closePrayer`, 'prayer');

  for (const section of ['treasures', 'ministry', 'living']) {
    for (const part of week[section] ?? []) {
      const type = part.cat === 'ministry' ? partTypeOf(part.title) : null;
      const slot0 = `${wId}_${part.id}_0`;
      suggest(slot0, effectiveCat(part), { type, role: '0' });
      if (String(part.roleLabel ?? '').includes('/')) {
        // Helper prefers the student's gender (S-38); CBS reader has its own pool.
        const student = existingAssignments[slot0] || result[slot0];
        const preferG = part.cat === 'ministry' ? genderOf(student) ?? null : null;
        suggest(`${wId}_${part.id}_1`, slotCat(part, '1'), { type, role: '1', preferG });
      }
    }
  }

  return result;
}
