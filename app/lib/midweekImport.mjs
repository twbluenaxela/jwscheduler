// Framework-free core of the EPUB re-import. The route wraps this with auth +
// a transaction; `node --test` drives it against the in-memory fake DB.
//
// Two modes (decided by the caller / the import dialog):
//   * 'keep'    — existing weeks are left exactly as they are. Handled by the
//                 caller (applyImport skips them); this module's reconcile is
//                 only ever invoked for 'replace' or for brand-new weeks.
//   * 'replace' — an existing week is overwritten by the EPUB: parts the EPUB
//                 no longer lists (including user-added `x_…` parts) are
//                 removed together with their assignments, parts the EPUB still
//                 lists are upserted (titles/durations/roleLabels/times reset),
//                 and assignments on surviving parts are kept. Orphan assignment
//                 rows (part gone) are deleted, each logged via logChange first.
//
// `applyImport` is the framework-free entry point: it resolves create/keep/
// replace per week inside the supplied transaction and returns
// { ids, results } where results[i] = { isoDate, action, clearedSlotIds }.
import { describeMidweekSlot, logChange } from './changelog.mjs';
import { parseMidweekSlotId } from './slotId.mjs';

export const ADDED_PART_PREFIX = 'x_';

export function isAddedPartKey(partKey) {
  return typeof partKey === 'string' && partKey.startsWith(ADDED_PART_PREFIX);
}

// Assignment IDs of this week whose part no longer exists after the import.
// `finalKeys` is every partKey the week will have. Chairman/prayer slots and
// anything that does not parse as a midweek slot are never touched.
export function orphanAssignments(week, assignments, finalKeys) {
  const weekId = Number(week?.id);
  const keys = finalKeys instanceof Set ? finalKeys : new Set(finalKeys ?? []);
  return (assignments ?? []).filter((assignment) => {
    const parsed = parseMidweekSlotId(assignment.slotId);
    if (!parsed || parsed.partKey === null) return false;
    return parsed.weekId === weekId && !keys.has(parsed.partKey);
  });
}

// Apply the reconciliation for one week in 'replace' mode (or for a brand-new
// week, where there is nothing to remove). Returns { removedPartKeys,
// clearedSlotIds }.
export async function reconcileImportedWeek(tx, { week, incomingParts, congregationId, actorName }) {
  const incomingKeys = new Set((incomingParts ?? []).map((part) => part.partKey));
  const removed = (week.parts ?? []).filter((part) => !incomingKeys.has(part.partKey));

  const orphans = orphanAssignments(week, week.assignments, incomingKeys);

  // Log while the removed parts (and their labels) are still resolvable.
  for (const assignment of orphans) {
    const slot = describeMidweekSlot(week, assignment.slotId);
    await logChange(tx, {
      congregationId,
      slotId: assignment.slotId,
      date: slot?.date ?? week.date,
      label: slot?.label ?? assignment.slotId,
      prevName: assignment.name,
      name: '',
      actorName,
    });
  }

  if (orphans.length) {
    await tx.assignment.deleteMany({ where: { id: { in: orphans.map((a) => a.id) } } });
  }
  if (removed.length) {
    await tx.part.deleteMany({ where: { weekId: week.id, partKey: { in: removed.map((p) => p.partKey) } } });
  }

  for (const part of incomingParts ?? []) {
    await tx.part.upsert({
      where: { weekId_partKey: { weekId: week.id, partKey: part.partKey } },
      update: part,
      create: { ...part, weekId: week.id },
    });
  }

  return {
    removedPartKeys: removed.map((p) => p.partKey),
    clearedSlotIds: orphans.map((a) => a.slotId),
  };
}

// Framework-free entry point used by the route (and tests). `weeks` is the
// cleaned list ({ week, parts } per item, as produced by cleanWeek). `mode`
// is 'keep' (default) or 'replace'.
export async function applyImport(tx, { congregationId, actorName, weeks, mode = 'keep' }) {
  const ids = [];
  const results = [];

  for (const item of weeks ?? []) {
    const existing = await tx.midweekWeek.findFirst({
      where: item.week.isoDate
        ? { congregationId, isoDate: item.week.isoDate }
        : {
            congregationId,
            OR: [
              ...(item.week.weekStart ? [{ weekStart: item.week.weekStart }] : []),
              { date: item.week.date },
            ],
          },
      orderBy: { id: 'asc' },
    });

    if (existing && mode === 'keep') {
      ids.push(existing.id);
      results.push({ isoDate: item.week.isoDate, action: 'kept', clearedSlotIds: [] });
      continue;
    }

    let week;
    let clearedSlotIds = [];
    if (existing) {
      week = await tx.midweekWeek.update({
        where: { id: existing.id },
        data: item.week,
      });
      const loaded = await tx.midweekWeek.findFirst({
        where: { id: week.id, congregationId },
        include: { parts: true, assignments: true },
      });
      const r = await reconcileImportedWeek(tx, {
        week: loaded ?? { ...week, parts: [], assignments: [] },
        incomingParts: item.parts,
        congregationId,
        actorName,
      });
      clearedSlotIds = r.clearedSlotIds;
      ids.push(week.id);
      results.push({ isoDate: item.week.isoDate, action: 'replaced', clearedSlotIds });
    } else {
      week = await tx.midweekWeek.create({
        data: { ...item.week, congregationId },
      });
      const loaded = await tx.midweekWeek.findFirst({
        where: { id: week.id, congregationId },
        include: { parts: true, assignments: true },
      });
      await reconcileImportedWeek(tx, {
        week: loaded ?? { ...week, parts: [], assignments: [] },
        incomingParts: item.parts,
        congregationId,
        actorName,
      });
      ids.push(week.id);
      results.push({ isoDate: item.week.isoDate, action: 'created', clearedSlotIds: [] });
    }
  }

  return { ids, results };
}
