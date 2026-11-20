// Pure planning helpers shared by the midweek parts routes and their tests.
// No Prisma / next/server here — the route wraps these with auth + transactions.

// Section order determines which sections come after a given one. The meeting
// runs treasures → ministry → 中場唱詩 → living → 結語 → 結束唱詩.
const SECTION_ORDER = { treasures: 0, ministry: 1, living: 2 };

export function parseDuration(value) {
  const match = String(value ?? '').match(/^\s*(\d+)\s*(?:分鐘|min)?\s*$/i);
  return match ? Number(match[1]) : null;
}

export function addMinutes(time, minutes) {
  const match = String(time ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !Number.isFinite(minutes)) return null;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const total = hour * 60 + minute + minutes;
  const nextHour = (((Math.floor(total / 60) - 1) % 12) + 12) % 12 + 1;
  const nextMinute = ((total % 60) + 60) % 60;
  return `${nextHour}:${String(nextMinute).padStart(2, '0')}`;
}

export function timeDifference(from, to) {
  const asMinutes = (value) => {
    const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = asMinutes(from);
  const end = asMinutes(to);
  if (start === null || end === null) return null;
  let difference = end - start;
  if (difference > 360) difference -= 720;
  if (difference < -360) difference += 720;
  return difference;
}

// Where a "insert before the first part of this section" action lands.
// The new part takes the first part's partNum and time; every part at or after
// that partNum is shifted up by one by the route.
export function planInsertAtStart(week, section) {
  const first = [...(week?.parts ?? [])]
    .filter((part) => part.section === section)
    .sort((a, b) => a.partNum - b.partNum)[0];
  if (!first) return null;
  return { partNum: first.partNum, time: first.time ?? '', renumberFrom: first.partNum };
}

// Walk a whole section in partNum order from a fixed start time. Used by the
// compressed-add path in POST and by the preview mock so both agree on times.
// Returns the absolute time/dur to write for every part plus the section's end.
export function recomputeSectionTimes(parts, startTime) {
  const sorted = [...(parts ?? [])].sort((a, b) => a.partNum - b.partNum);
  let cursor = startTime ?? '';
  const updates = [];
  for (const part of sorted) {
    if (!cursor) break;
    updates.push({
      id: part.id,
      partKey: part.partKey ?? part.id,
      partNum: part.partNum,
      time: cursor,
      dur: part.dur ?? '',
    });
    cursor = addMinutes(cursor, parseDuration(part.dur));
  }
  return { updates, end: cursor };
}

// When one section's end moves by `delta` minutes, push everything that comes
// after it by the same amount so later sections never overlap or leave a gap.
// Returns only the fields whose time actually parsed (others stay untouched).
export function planCascade(week, { section, delta }) {
  const shift = Number(delta);
  const order = SECTION_ORDER[section];
  if (order === undefined || !Number.isFinite(shift) || shift === 0) return { parts: [] };

  const parts = (week?.parts ?? [])
    .filter((part) => SECTION_ORDER[part.section] !== undefined && SECTION_ORDER[part.section] > order)
    .map((part) => ({ id: part.id, partKey: part.partKey, time: addMinutes(part.time, shift) }))
    .filter((entry) => entry.time !== null);

  const result = { parts };
  // 中場唱詩 sits between ministry and living, so only earlier sections move it.
  if (order < SECTION_ORDER.living) {
    const midSongTime = addMinutes(week?.midSongTime, shift);
    if (midSongTime !== null) result.midSongTime = midSongTime;
  }
  const closingTime = addMinutes(week?.closingTime, shift);
  if (closingTime !== null) result.closingTime = closingTime;
  const closeSongTime = addMinutes(week?.closeSongTime, shift);
  if (closeSongTime !== null) result.closeSongTime = closeSongTime;
  return result;
}

// Client-week equivalent of planCascade. The editor keeps parts grouped by
// section, so shift every part after `partNum` (including later parts of the
// same section), plus 中場唱詩 for earlier sections and the closing times.
// Returns a new week object; unparseable times are left untouched.
export function retimeClientWeek(week, { section, partNum, delta }) {
  const shift = Number(delta);
  const order = SECTION_ORDER[section];
  const anchor = Number(partNum);
  if (order === undefined || !Number.isFinite(shift) || shift === 0 || !Number.isFinite(anchor)) return week;

  const next = { ...week };
  for (const name of ['treasures', 'ministry', 'living']) {
    if (SECTION_ORDER[name] < order) continue;
    next[name] = (week[name] ?? []).map((part) => {
      if (Number(part.partNum) <= anchor) return part;
      const time = addMinutes(part.time, shift);
      return time === null ? part : { ...part, time };
    });
  }
  if (order < SECTION_ORDER.living) {
    const midSongTime = addMinutes(week.midSongTime, shift);
    if (midSongTime !== null) next.midSongTime = midSongTime;
  }
  const closingTime = addMinutes(week.closingTime, shift);
  if (closingTime !== null) next.closingTime = closingTime;
  const closeSongTime = addMinutes(week.closeSongTime, shift);
  if (closeSongTime !== null) next.closeSongTime = closeSongTime;
  return next;
}

// Take `newMinutes` out of the other parts of one section so the section's
// end time stays put. Each part can shrink at most to ceil(minutes / 2);
// allocation is proportional with largest-remainder, then leftovers are
// redistributed to parts that still have capacity. Anything left over is the
// shortfall (the meeting would end that many minutes late).
export function planCompression(sectionParts, newMinutes) {
  const target = Number(newMinutes);
  if (!Number.isFinite(target) || target <= 0) return { changes: [], shortfall: 0 };

  const eligible = (sectionParts ?? [])
    .map((part) => ({ part, minutes: parseDuration(part.dur) }))
    .filter((entry) => Number.isInteger(entry.minutes) && entry.minutes > 0);
  if (!eligible.length) return { changes: [], shortfall: target };

  const floors = eligible.map((entry) => Math.ceil(entry.minutes / 2));
  const capacities = eligible.map((entry, i) => entry.minutes - floors[i]);
  const totalMinutes = eligible.reduce((sum, entry) => sum + entry.minutes, 0);

  const raw = eligible.map((entry) => target * entry.minutes / totalMinutes);
  const bases = raw.map((value) => Math.floor(value));
  const allocated = [...bases];
  let remainder = target - bases.reduce((sum, value) => sum + value, 0);
  const byRemainder = eligible
    .map((_, i) => i)
    .sort((a, b) => (raw[b] - bases[b]) - (raw[a] - bases[a]) || a - b);
  for (let i = 0; remainder > 0; i++, remainder--) {
    allocated[byRemainder[i % byRemainder.length]] += 1;
  }

  const reductions = eligible.map((_, i) => Math.min(allocated[i], capacities[i]));
  let leftover = target - reductions.reduce((sum, value) => sum + value, 0);
  while (leftover > 0) {
    let added = false;
    for (let i = 0; i < eligible.length && leftover > 0; i++) {
      const room = capacities[i] - reductions[i];
      if (room > 0) {
        const take = Math.min(room, leftover);
        reductions[i] += take;
        leftover -= take;
        added = true;
      }
    }
    if (!added) break;
  }

  const changes = eligible
    .map((entry, i) => ({
      partKey: entry.part.partKey ?? entry.part.id,
      title: entry.part.title ?? '',
      from: entry.minutes,
      to: entry.minutes - reductions[i],
    }))
    .filter((change) => change.to !== change.from);
  return { changes, shortfall: leftover };
}

// Plan a part deletion against an already-loaded week (with its `parts`).
// Returns the absolute partNum/time to write for every part that follows the
// removed one, plus the cascaded 中場唱詩 / 結語 times.
// `updates` uses the same shape as the POST route:
// { id, partKey, partNum, time, dur }.
export function planPartDeletion(week, partKey) {
  const parts = week?.parts ?? [];
  const deleted = parts.find((part) => part.partKey === partKey);
  if (!deleted) return null;

  const updates = [];
  const byId = new Map();
  // Renumber every later part across all sections.
  for (const part of parts) {
    if (part.partNum > deleted.partNum) {
      const entry = {
        id: part.id,
        partKey: part.partKey,
        partNum: part.partNum - 1,
        time: part.time ?? '',
        dur: part.dur ?? '',
      };
      byId.set(part.id, entry);
      updates.push(entry);
    }
  }

  // Times: walk the parts of the SAME section after the deleted one in
  // partNum order, starting from the deleted part's time. This is the inverse
  // of POST's insert-time walk.
  let cursor = deleted.time ?? '';
  const laterSameSection = parts
    .filter((part) => part.section === deleted.section && part.partNum > deleted.partNum)
    .sort((a, b) => a.partNum - b.partNum);
  for (const part of laterSameSection) {
    if (!cursor) break;
    const entry = byId.get(part.id);
    if (entry) entry.time = cursor;
    cursor = addMinutes(cursor, parseDuration(part.dur));
  }

  // How far did this section's end move? Push every later section (and the
  // shared 中場唱詩 / 結語 times) by that same delta.
  const sectionParts = parts
    .filter((part) => part.section === deleted.section)
    .sort((a, b) => a.partNum - b.partNum);
  const firstTime = sectionParts[0]?.time ?? '';
  const oldEnd = recomputeSectionTimes(sectionParts, firstTime).end;
  const newEnd = recomputeSectionTimes(
    sectionParts.filter((part) => part.partKey !== partKey), firstTime,
  ).end;
  const cascade = planCascade(week, { section: deleted.section, delta: timeDifference(oldEnd, newEnd) });

  for (const change of cascade.parts) {
    const entry = byId.get(change.id);
    if (entry) {
      entry.time = change.time;
    } else {
      const source = parts.find((part) => part.id === change.id);
      const added = {
        id: change.id,
        partKey: change.partKey,
        partNum: (source?.partNum ?? 1) - 1,
        time: change.time,
        dur: source?.dur ?? '',
      };
      byId.set(added.id, added);
      updates.push(added);
    }
  }

  const result = { updates };
  if (cascade.midSongTime !== undefined) result.midSongTime = cascade.midSongTime;
  if (cascade.closingTime !== undefined) result.closingTime = cascade.closingTime;
  if (cascade.closeSongTime !== undefined) result.closeSongTime = cascade.closeSongTime;
  return result;
}

// Only 基督徒的生活 is editable — the first two sections are fixed by domain rule.
export const EDITABLE_SECTION = 'living';
export function canEditMidweekSection(section) { return section === EDITABLE_SECTION; }

// Compact label for tight UI chips: drop the parenthetical detail while
// keeping the caller's original title for tooltips / aria labels.
export function shortPartTitle(title) {
  return String(title ?? '').split(/[（(]/)[0].trim();
}

// Where can `newMinutes` be taken from for a new part in living? Nothing is
// protected (會眾研經班 included). 'spread' is the default: planCompression over
// every living part with its usual half-time floor. Each subsequent chip takes
// the whole amount from one part that can spare it; 'later' pushes the end back.
export function timeSourceOptions(sectionParts, newMinutes) {
  const target = Number(newMinutes);
  const parts = sectionParts ?? [];
  const spread = planCompression(parts, target);
  const spreadChanges = spread.changes.map((change) => ({
    ...change,
    title: shortPartTitle(change.title),
    fullTitle: change.title,
  }));
  const options = [{
    key: 'spread',
    label: '平均分攤',
    adjust: spread.changes.map((change) => ({ partKey: change.partKey, dur: `${change.to} 分鐘` })),
    changes: spreadChanges,
    shortfall: spread.shortfall,
  }];

  for (const part of parts) {
    const minutes = parseDuration(part.dur);
    if (!Number.isFinite(target) || !Number.isInteger(minutes) || minutes - target < 1) continue;
    const partKey = part.partKey ?? part.id;
    const to = minutes - target;
    options.push({
      key: partKey,
      partKey,
      label: `${shortPartTitle(part.title)} ${minutes}→${to}`,
      fullTitle: part.title ?? '',
      from: minutes,
      to,
      adjust: [{ partKey, dur: `${to} 分鐘` }],
    });
  }

  options.push({ key: 'later', label: '延後結束', adjust: [] });
  return { options, defaultKey: 'spread' };
}

// Build the POST payload that restores a just-deleted part. `afterPartKey` is
// the part immediately before the deleted one within the same section (null
// when it was first), so posting with no adjust re-inserts it in place.
export function buildRestorePayload(week, partKey, assignments = []) {
  const parts = week?.parts ?? [];
  const deleted = parts.find((part) => part.partKey === partKey);
  if (!deleted) return null;

  const previous = parts
    .filter((part) => part.section === deleted.section && part.partNum < deleted.partNum)
    .sort((a, b) => b.partNum - a.partNum)[0];

  const restoreAssignments = (assignments ?? [])
    .map((assignment) => {
      const parsed = Number(String(assignment?.slotId ?? '').match(/_(\d+)$/)?.[1]);
      const index = Number.isInteger(assignment?.index) ? assignment.index : (Number.isFinite(parsed) ? parsed : 0);
      return { index, name: assignment?.name ?? '' };
    })
    .sort((a, b) => a.index - b.index);

  return {
    section: deleted.section,
    afterPartKey: previous?.partKey ?? null,
    title: deleted.title ?? '',
    dur: deleted.dur ?? '',
    time: deleted.time ?? '',
    cat: deleted.cat,
    roleLabel: deleted.roleLabel ?? null,
    scenario: deleted.scenario ?? '',
    hideHelper: Boolean(deleted.hideHelper),
    assignments: restoreAssignments,
  };
}
