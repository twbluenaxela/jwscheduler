// Pure suggestion engine — no DB, no fetch, no React.
// People input shape: { name, g, quals: string[], status }
// History input shape: { name, date }[]

const CAT_REQS = {
  chairman:    { tag: '主席',        g: 'M'   },
  prayer:      { tag: '禱告',        g: 'M'   },
  treasures:   { tag: '寶藏演講',    g: 'M'   },
  gems:        { tag: '經文寶石',    g: 'M'   },
  reading:     { tag: '經文朗讀',    g: 'M'   },
  ministry:    { tag: '傳道示範',    g: 'any' },
  living:      { tag: '生活演講',    g: 'M'   },
  cbs:         { tag: '研經班主持',  g: 'M'   },
  cbsread:     { tag: '研經班朗讀',  g: 'M'   },
  publictalk:  { tag: '公眾演講',    g: 'M'   },
  wt:          { tag: '主席',        g: 'M'   },
  wtread:      { tag: '守望台朗讀',  g: 'any' },
};

function parseDate(str) {
  const s = String(str ?? '');
  const cn = s.match(/(\d+)月\s*(\d+)日/);
  if (cn) {
    const now = new Date();
    let yr = now.getFullYear();
    const mo = +cn[1];
    if (mo < now.getMonth() + 1 - 6) yr++;
    else if (mo > now.getMonth() + 1 + 6) yr--;
    return new Date(yr, mo - 1, +cn[2]);
  }
  const sl = s.match(/^(\d+)\/(\d+)$/);
  if (sl) {
    const now = new Date();
    let yr = now.getFullYear();
    const mo = +sl[1];
    if (mo < now.getMonth() + 1 - 6) yr++;
    else if (mo > now.getMonth() + 1 + 6) yr--;
    return new Date(yr, mo - 1, +sl[2]);
  }
  return null;
}

// Returns candidates sorted: longest gap desc, then fewest total asc.
function rankCandidates(people, tag, gender, history) {
  const eligible = people.filter(p =>
    p.status === 'active' &&
    (p.quals ?? []).includes(tag) &&
    (gender === 'any' || p.g === gender)
  );

  const now = Date.now();
  const lastSeen = new Map();
  const counts = new Map();
  for (const h of history) {
    if (!h.name) continue;
    const d = parseDate(h.date);
    if (!d) continue;
    const prev = lastSeen.get(h.name);
    if (!prev || d > prev) lastSeen.set(h.name, d);
    counts.set(h.name, (counts.get(h.name) ?? 0) + 1);
  }

  return eligible
    .map(p => ({
      name: p.name,
      daysSince: lastSeen.has(p.name)
        ? Math.floor((now - lastSeen.get(p.name)) / 86400000)
        : 9999,
      count: counts.get(p.name) ?? 0,
    }))
    .sort((a, b) => b.daysSince - a.daysSince || a.count - b.count);
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
export function suggestWeekendRow(people, pastRows, existing = {}) {
  const used = new Set(Object.values(existing).filter(Boolean));
  const hist = {
    speaker: pastRows.filter(r => r.speaker).map(r => ({ name: r.speaker, date: r.date })),
    chair:   pastRows.filter(r => r.chair).map(r => ({ name: r.chair,   date: r.date })),
    wt:      pastRows.filter(r => r.wt).map(r => ({ name: r.wt,         date: r.date })),
    read:    pastRows.filter(r => r.read).map(r => ({ name: r.read,      date: r.date })),
  };
  return {
    speaker: pickOne(rankCandidates(people, '公眾演講',   'M',   hist.speaker), used),
    chair:   pickOne(rankCandidates(people, '主席',       'M',   hist.chair),   used),
    wt:      pickOne(rankCandidates(people, '主席',       'M',   hist.wt),      used),
    read:    pickOne(rankCandidates(people, '守望台朗讀', 'any', hist.read),    used),
  };
}

// Suggest assignments for all empty slots in a midweek week.
// week: { id, treasures, ministry, living } frontend shape (parts have .id = partKey, .cat, .roleLabel)
// existingAssignments: { [slotId]: name } — already confirmed slots
// pastHistory: [{ name, cat, date }]
export function suggestMidweekWeek(people, week, existingAssignments, pastHistory) {
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
    const name = pickOne(rankCandidates(people, req.tag, req.g, histByCat[catKey] ?? []), used);
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
