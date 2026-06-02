// Pure function — no React, no DB, no fetch.
// Builds a history map of assignments before a reference date per person+tag,
// used by AssignSheet to display real recency stats.
//
// refDate: the date of the slot being assigned (not necessarily today).
//   Only assignments STRICTLY BEFORE refDate count; assignments on or after refDate
//   are excluded (an assignment on the slot's own date is the meeting being planned,
//   not past history). This means a 6/3 assignment shows up when assigning for 7/1,
//   but the 禱告 person already in the 6/24 slot does NOT count toward the 6/24 禱告 slot.
//   `daysSince` is measured from refDate — so 6/3 shows "28 天" when assigning for 7/1,
//   never 0 (same-day) or a negative number relative to the real calendar today.
//
// Returns: { [name]: { [tag]: { lastDate: Date, daysSince: number, halfYearCount: number } } }

import { CATS } from '../data/index.js';

function parseDate(str, ref) {
  const s = String(str ?? '');
  const cn = s.match(/(\d+)月\s*(\d+)日/);
  const sl = s.match(/^(\d+)\/(\d+)$/);
  const m = cn ?? sl;
  if (!m) return null;
  let yr = ref.getFullYear();
  const mo = +m[1];
  if (mo > ref.getMonth() + 7) yr--;
  else if (mo < ref.getMonth() - 5) yr++;
  return new Date(yr, mo - 1, +m[2]);
}

// Returns the meeting date for the slot being assigned.
// Falls back to today if the slot's week/row can't be found.
export function slotRefDate(slotId, midweekWeeks, weekendRows) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (slotId?.startsWith('mw')) {
    const weekId = Number(slotId.split('_')[0].slice(2));
    const w = midweekWeeks.find(wk => wk.id === weekId);
    if (w) {
      const d = parseDate(w.date, now);
      if (d) return d;
    }
  } else if (slotId?.startsWith('we')) {
    const rowId = Number(slotId.split('_')[0].slice(2));
    const row = weekendRows.find(r => r._id === rowId || r.id === rowId);
    if (row) {
      const d = parseDate(row.date, now);
      if (d) return d;
    }
  }
  return now;
}

export function buildPastHistory(midweekWeeks, assignments, weekendRows, refDate = new Date()) {
  const ref = new Date(refDate);
  ref.setHours(0, 0, 0, 0);
  const halfYearAgo = new Date(ref);
  halfYearAgo.setDate(halfYearAgo.getDate() - 180);

  const weekDateMap = {};
  for (const w of midweekWeeks) {
    const d = parseDate(w.date, ref);
    if (d) weekDateMap[w.id] = d;
  }

  const hist = {};

  function record(name, tag, date) {
    // Strictly before refDate: an assignment ON the slot's own meeting date is the
    // meeting being planned (the slot being edited / a sibling on the same date),
    // not past history — so it must not count toward "days since" or the load count.
    if (!name || !tag || !date || date >= ref) return;
    if (!hist[name]) hist[name] = {};
    if (!hist[name][tag]) hist[name][tag] = { lastDate: null, halfYearCount: 0 };
    const entry = hist[name][tag];
    if (!entry.lastDate || date > entry.lastDate) entry.lastDate = date;
    if (date >= halfYearAgo) entry.halfYearCount++;
  }

  for (const [slotId, name] of Object.entries(assignments)) {
    if (!name || !slotId.startsWith('mw')) continue;
    const parts = slotId.split('_');
    const weekId = Number(parts[0].slice(2));
    const date = weekDateMap[weekId];
    if (!date) continue;
    const suffix = parts[1];
    if (suffix === 'chairman') {
      record(name, CATS.chairman.tag, date);
    } else if (suffix === 'openPrayer' || suffix === 'closePrayer') {
      record(name, CATS.prayer.tag, date);
    } else {
      const partKey = parts[1]; // e.g. 't0', 'm0' — matches part.id in mapped week data
      const w = midweekWeeks.find(wk => wk.id === weekId);
      // Mapped weeks store parts under section arrays (treasures/ministry/living),
      // not a flat `parts` array. Fall back to `parts` for seed/test data.
      const allParts = w
        ? [...(w.treasures ?? []), ...(w.ministry ?? []), ...(w.living ?? []), ...(w.parts ?? [])]
        : [];
      const part = allParts.find(p => p.id === partKey);
      if (part && CATS[part.cat]) record(name, CATS[part.cat].tag, date);
    }
  }

  const weTagMap = {
    speaker: CATS.publictalk?.tag,
    chair:   CATS.weekendchair?.tag,
    wt:      CATS.wt?.tag,
    read:    CATS.wtread?.tag,
  };
  for (const row of weekendRows) {
    const d = parseDate(row.date, ref);
    if (!d) continue;
    for (const [field, tag] of Object.entries(weTagMap)) {
      if (tag) record(row[field], tag, d);
    }
  }

  // Compute daysSince relative to refDate (never negative — lastDate <= ref).
  for (const tags of Object.values(hist)) {
    for (const entry of Object.values(tags)) {
      entry.daysSince = entry.lastDate
        ? Math.floor((ref - entry.lastDate) / 86400000)
        : null;
    }
  }

  return hist;
}
