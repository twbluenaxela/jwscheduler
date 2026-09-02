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
import { partTypeOf, effectiveCat, slotCat, FAMILIES, FAMILY_OF } from './partTypes.mjs';
import { parseCnDate as parseDate } from './cnDate.mjs';
import { buildPairIndex, partnersWithin, PAIR_REPEAT_WINDOW_DAYS } from './pairHistory.mjs';
import { pioneerBonus } from './appointments.mjs';

const CAT_REQS = Object.fromEntries(
  Object.entries(CATS).map(([k, v]) => [k, { tag: v.tag, g: v.g }])
);

// How many top-fairness candidates to consider when rotating part types.
// Within this window the person who has gone longest without doing THIS
// specific part type + role wins, so nobody gets stuck with e.g. 初次交談
// or the 助手 role forever while overall fairness stays dominant.
const ROTATE_WINDOW = 5;

// …but the window may only reorder people who are roughly EQUALLY rested.
// 用心準備傳道工作 parts (初次交談 / 再次交談 / 解釋自己的信仰 / 教導人成為門徒)
// are all the same kind of student practice, so the goal is a steady rotation
// through the pool — the type distinction is for the record, not a licence to
// bring someone back early. Without this guard the rotation window could promote
// the 5th-ranked candidate (who served last week) over the 1st (who served two
// months ago) merely because they had never done THAT title, producing
// back-to-back weeks. A candidate may only be rotated ahead if their own gap is
// within one meeting cycle of the best available gap.
const ROTATE_GAP_TOLERANCE_DAYS = 7;

// Year inference lives in cnDate.mjs so the picker (pastHistory) and this
// engine can never disagree about what 「6月 3日」 means.

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
      // 先驅 rank as though they had been free a little longer than they
      // really have (appointments.mjs) — enough to win ties and near-ties, not
      // enough to jump someone genuinely less used. `gap` carries the bonus so
      // every consumer (pickRotated's tolerance window included) sees one
      // consistent notion of "how rested is this person".
      const gap = Math.min(daysSince, daysUntil) + pioneerBonus(p);
      return { name: p.name, gap, count: counts.get(p.name) ?? 0 };
    })
    .sort((a, b) => b.gap - a.gap || a.count - b.count);
}

// Names with an assignment in ANY category within ±CROWD_WINDOW_DAYS of the
// slot (other than the meeting itself). They are demoted below everyone who is
// free around that date — but stay pickable, so slots still fill when the
// whole pool is busy.
const CROWD_WINDOW_DAYS = 7;

// Assignment families (FAMILIES / FAMILY_OF) live in partTypes.mjs so the
// manual picker uses the same table. On top of the shared history they get a
// monthly repeat demotion here (±MONTHLY_REPEAT_WINDOW_DAYS, much wider than the
// general 7-day crowd window) so the same person doesn't come round twice in a
// month while others in the pool are still free. Like every rule in this file it
// is a demotion, never an exclusion — a small pool still fills every slot.
const MONTHLY_REPEAT_WINDOW_DAYS = 28;

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
// - pairedRecently: names already paired with this slot's counterpart inside the
//   pair-repeat window (學生／助手 variety) — demoted below everyone else.
function pickRotated(ranked, used, { type, role, typeRoleLast, preferG, genderOf, crowded, pairedRecently } = {}) {
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
  // Pair variety: someone already paired with this slot's counterpart inside
  // PAIR_REPEAT_WINDOW_DAYS drops below everyone who has not been. Applied
  // AFTER the crowd/monthly filter on purpose — spreading the LOAD matters more
  // than spreading the partnerships, and like every other rule here it is a
  // demotion, not an exclusion, so the slot still fills from a small pool.
  if (pairedRecently?.size) {
    const fresh = avail.filter(c => !pairedRecently.has(c.name));
    if (fresh.length) avail = fresh;
  }
  if (!avail.length) return null;
  let best = avail[0];
  if (type && typeRoleLast) {
    // Only near-ties on fairness may be reordered by part type (see
    // ROTATE_GAP_TOLERANCE_DAYS) — otherwise type rotation would undo the
    // spacing the gap ranking just produced.
    const floor = avail[0].gap - ROTATE_GAP_TOLERANCE_DAYS;
    const pool = avail.filter(c => c.gap >= floor).slice(0, ROTATE_WINDOW);
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

  // 學生／助手 pairing history. Entries carrying a `pairId` (weekId+partKey)
  // are the two halves of ONE pair-capable part: grouping by pairId recovers
  // who served WITH whom, without the caller having to pass a second history.
  const pairSlots = new Map();
  for (const h of pastHistory) {
    if (!h.pairId || h.role == null || !h.name) continue;
    const slot = pairSlots.get(h.pairId) ?? { date: h.date };
    slot[String(h.role)] = h.name;
    pairSlots.set(h.pairId, slot);
  }
  const pairIndex = buildPairIndex(
    [...pairSlots.values()]
      .filter(s => s['0'] && s['1'])
      .map(s => ({ a: s['0'], b: s['1'], date: parseDate(s.date, ref) }))
      .filter(s => s.date)
  );

  const crowded = crowdedNames(pastHistory, ref);
  // Per-FAMILY monthly repeat sets — a 朗讀 turn last week must not demote a
  // ministry candidate (and vice versa); only same-family load counts.
  const monthlyByFamily = Object.fromEntries(
    Object.entries(FAMILIES).map(([fam, cats]) => [
      fam,
      crowdedNames(
        pastHistory.filter(h => cats.includes(h.cat)),
        ref,
        MONTHLY_REPEAT_WINDOW_DAYS,
      ),
    ])
  );
  const suggest = (slotId, catKey, opts = {}) => {
    if (existingAssignments[slotId]) return;
    const req = CAT_REQS[catKey];
    if (!req) return;
    const fam = FAMILY_OF.get(catKey);
    // Family cats add their family's monthly-repeat set on top of the regular
    // 7-day crowd window, and rank on the whole family's shared history, so a
    // brother who read at 研經班 last month is not treated as "never did
    // 經文朗讀" and pulled straight back in. (See FAMILIES above.)
    const effCrowded = fam
      ? new Set([...crowded, ...monthlyByFamily[fam]])
      : crowded;
    const hist = fam
      ? FAMILIES[fam].flatMap(c => histByCat[c] ?? [])
      : (histByCat[catKey] ?? []);
    const ranked = demoteCrowded(rankCandidates(people, req.tag, req.g, hist, ref), effCrowded);
    // `pairWith` = whoever holds the other half of this part. Anyone already
    // paired with them inside the window is demoted (see pickRotated).
    const pairedRecently = opts.pairWith
      ? partnersWithin(pairIndex, opts.pairWith, ref, PAIR_REPEAT_WINDOW_DAYS)
      : null;
    const name = pickRotated(ranked, used, { ...opts, typeRoleLast, genderOf, crowded: effCrowded, pairedRecently });
    if (name) result[slotId] = name;
  };

  suggest(`${wId}_chairman`,   'chairman');
  suggest(`${wId}_openPrayer`, 'prayer');
  suggest(`${wId}_closePrayer`, 'prayer');

  for (const section of ['treasures', 'ministry', 'living']) {
    for (const part of week[section] ?? []) {
      const type = part.cat === 'ministry' ? partTypeOf(part.title) : null;
      const isDemo = part.cat === 'ministry' && String(part.roleLabel ?? '').includes('/');
      const slot0 = `${wId}_${part.id}_0`;
      const slot1 = `${wId}_${part.id}_1`;
      // Pair variety applies to 傳道示範 demos only. When the helper is already
      // set (the admin filled it, or is re-running ✦ on a half-filled part) the
      // STUDENT pick avoids her past partners too, not just the other way round.
      suggest(slot0, effectiveCat(part), {
        type, role: '0',
        pairWith: isDemo ? existingAssignments[slot1] || null : null,
      });
      if (String(part.roleLabel ?? '').includes('/')) {
        // Helper prefers the student's gender (S-38); CBS reader has its own pool.
        const student = existingAssignments[slot0] || result[slot0];
        const preferG = part.cat === 'ministry' ? genderOf(student) ?? null : null;
        suggest(slot1, slotCat(part, '1'), {
          type, role: '1', preferG,
          pairWith: isDemo ? student || null : null,
        });
      }
    }
  }

  return result;
}
