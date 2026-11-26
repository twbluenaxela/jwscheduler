// Framework-free core of the EPUB re-import reconciliation. The route wraps
// this with auth + a transaction; `node --test` drives it against the in-memory
// fake DB (same pattern as mutations.mjs).
//
// WHY THIS EXISTS: the import used to `part.deleteMany({ partKey: { notIn } })`
// for every week in the EPUB. That silently destroyed the two things the admin
// had done by hand after the last import:
//   * parts ADDED in 基督徒的生活 — their partKey is `x_<32 hex>`, which an EPUB
//     can never contain, so they were deleted along with their assignments;
//   * assignments of any part that the new EPUB no longer lists — the Part row
//     went away, the Assignment rows stayed, and nothing could ever clean them.
//
// WHAT IT DOES NOW:
//   * keeps every user-added `x_…` part and re-inserts it in its old position
//     (immediately after the part it followed) in the incoming numbering;
//   * deletes the parts the EPUB dropped, and their assignments, logging a
//     ChangeLog clear for each (the part still exists when the label resolves);
//   * sweeps any other Assignment row of the week whose part no longer exists,
//     so an orphan can never survive an import.
//
// WHAT IT CANNOT DO WITHOUT A SCHEMA COLUMN: tell "the admin deleted this part"
// apart from "this EPUB simply does not list it". A part deleted by hand is
// absent from `existingParts`, so the upsert below recreates it when the same
// issue is imported again. That needs a per-week tombstone (see the report).
import { describeMidweekSlot, logChange } from './changelog.mjs';
import { parseMidweekSlotId } from './slotId.mjs';

// Parts added through the UI always use this prefix (see the parts route).
export const ADDED_PART_PREFIX = 'x_';

export function isAddedPartKey(partKey) {
  return typeof partKey === 'string' && partKey.startsWith(ADDED_PART_PREFIX);
}

const inOrder = (parts) => [...(parts ?? [])].sort((a, b) => a.partNum - b.partNum);

// Split the existing week's parts into what the EPUB replaces and what the
// admin added and must survive.
export function planImportParts(existingParts, incomingParts) {
  const incomingKeys = new Set((incomingParts ?? []).map((part) => part.partKey));
  const existing = existingParts ?? [];
  return {
    retained: inOrder(existing.filter((part) => isAddedPartKey(part.partKey) && !incomingKeys.has(part.partKey))),
    removed: inOrder(existing.filter((part) => !isAddedPartKey(part.partKey) && !incomingKeys.has(part.partKey))),
  };
}

// The final part order for the week: the EPUB's own numbering, with every
// retained `x_…` part spliced back immediately after the part it followed. A
// retained part whose anchor the EPUB dropped goes to the front (its section is
// still authoritative for where it renders).
// Returns EVERY part in final order as [{ partKey, partNum }] — callers compare
// against the stored numbers rather than trusting a "changed" flag, because an
// incoming part can land on the same number a retained part already holds.
export function planImportRenumber(existingParts, incomingParts) {
  const incoming = inOrder(incomingParts);
  const { retained } = planImportParts(existingParts, incomingParts);
  const list = [...incoming];

  if (retained.length) {
    const incomingKeys = new Set(incoming.map((part) => part.partKey));
    const insertedAfter = new Map();
    const existingOrder = inOrder(existingParts);

    for (const part of retained) {
      // Nearest preceding part (in the week's old order) that the EPUB still has.
      let anchorKey = null;
      for (let i = existingOrder.indexOf(part) - 1; i >= 0; i -= 1) {
        if (incomingKeys.has(existingOrder[i].partKey)) {
          anchorKey = existingOrder[i].partKey;
          break;
        }
      }
      const count = insertedAfter.get(anchorKey) ?? 0;
      const index = anchorKey === null ? count : list.findIndex((p) => p.partKey === anchorKey) + 1 + count;
      list.splice(index, 0, part);
      insertedAfter.set(anchorKey, count + 1);
    }
  }

  if (!list.length) return [];
  const start = Math.min(...[...incoming, ...retained].map((part) => part.partNum));
  return list.map((part, i) => ({ partKey: part.partKey, partNum: start + i }));
}

// Which of `ordered` differ from the numbers the week actually stores.
export function renumberUpdates(ordered, parts) {
  const current = new Map((parts ?? []).map((part) => [part.partKey, part.partNum]));
  return (ordered ?? []).filter((entry) => current.get(entry.partKey) !== entry.partNum);
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

// Apply the reconciliation for one week. `week` is the DB row already loaded
// with its `parts` and `assignments`. Returns a summary for the route/tests.
export async function reconcileImportedWeek(tx, { week, incomingParts, congregationId, actorName }) {
  const { retained, removed } = planImportParts(week.parts, incomingParts);
  const finalKeys = new Set([
    ...(incomingParts ?? []).map((part) => part.partKey),
    ...retained.map((part) => part.partKey),
  ]);

  const orphans = orphanAssignments(week, week.assignments, finalKeys);

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

  // Renumber against the state the week is actually in now: incoming parts came
  // from the EPUB (their own numbers), retained added parts keep the numbers they
  // had, and the retained ones get spliced back into the sequence.
  const fresh = await tx.part.findMany({ where: { weekId: week.id } });
  const ordered = planImportRenumber(fresh, incomingParts);
  const renumbered = renumberUpdates(ordered, fresh);
  for (const update of renumbered) {
    const row = fresh.find((p) => p.partKey === update.partKey);
    if (row) await tx.part.update({ where: { id: row.id }, data: { partNum: update.partNum } });
  }

  return {
    removedPartKeys: removed.map((p) => p.partKey),
    retainedPartKeys: retained.map((p) => p.partKey),
    orphanSlotIds: orphans.map((a) => a.slotId),
    renumbered,
  };
}
