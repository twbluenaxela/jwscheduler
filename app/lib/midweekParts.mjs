// Pure planning helpers shared by the midweek parts routes and their tests.
// No Prisma / next/server here — the route wraps these with auth + transactions.

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
// removed one, plus the shifted closing times when a living part was removed.
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

  const result = { updates };
  if (deleted.section === 'living' && cursor) {
    const closingDelta = timeDifference(week.closingTime, cursor);
    const nextCloseSongTime = closingDelta !== null && week.closeSongTime
      ? addMinutes(week.closeSongTime, closingDelta)
      : null;
    result.closingTime = cursor;
    result.closeSongTime = nextCloseSongTime ?? '';
  }
  return result;
}
