// Pure function — no React, no DB, no fetch.
// Builds a history map of past (before today) assignments per person+tag,
// used by AssignSheet to display real recency stats.
//
// Returns: { [name]: { [tag]: { lastDate: Date, halfYearCount: number } } }

import { CATS } from '../data/index.js';

function parseDate(str, today) {
  const s = String(str ?? '');
  const cn = s.match(/(\d+)月\s*(\d+)日/);
  const sl = s.match(/^(\d+)\/(\d+)$/);
  const m = cn ?? sl;
  if (!m) return null;
  let yr = today.getFullYear();
  const mo = +m[1];
  if (mo > today.getMonth() + 7) yr--;
  else if (mo < today.getMonth() - 5) yr++;
  return new Date(yr, mo - 1, +m[2]);
}

export function buildPastHistory(midweekWeeks, assignments, weekendRows, today = new Date()) {
  const todayMidnight = new Date(today);
  todayMidnight.setHours(0, 0, 0, 0);
  const halfYearAgo = new Date(todayMidnight);
  halfYearAgo.setDate(halfYearAgo.getDate() - 180);

  const weekDateMap = {};
  for (const w of midweekWeeks) {
    const d = parseDate(w.date, todayMidnight);
    if (d) weekDateMap[w.id] = d;
  }

  const hist = {};

  function record(name, tag, date) {
    if (!name || !tag || !date || date >= todayMidnight) return;
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
      const partId = Number(parts[1]);
      const w = midweekWeeks.find(wk => wk.id === weekId);
      const part = w?.parts?.find(p => p.id === partId);
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
    const d = parseDate(row.date, todayMidnight);
    if (!d) continue;
    for (const [field, tag] of Object.entries(weTagMap)) {
      if (tag) record(row[field], tag, d);
    }
  }

  return hist;
}
