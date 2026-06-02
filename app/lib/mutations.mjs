// Framework-free cores for the assignment-mutating routes. The Prisma client is
// injected (`db`) so these can be integration-tested against an in-memory fake —
// no next/server, no Prisma singleton, no network. The route files wrap these
// with auth + HTTP plumbing.

import { describeMidweekSlot, weekendFieldLabel, logChange, WEEKEND_NAME_FIELDS } from './changelog.mjs';

export const ALLOWED_WEEKEND_FIELDS = new Set([
  'speaker', 'chair', 'wt', 'read', 'host', 'away', 'topic', 'no', 'cong', 'note', 'label', 'date',
]);

// Upsert/clear a single midweek assignment by slotId and log the change.
// Returns { status, body } for the HTTP wrapper. Assumes auth is already done.
export async function applyMidweekAssignment(db, user, slotId, name) {
  if (typeof slotId !== 'string') return { status: 400, body: { error: '缺少 slotId' } };

  const match = slotId.match(/^mw(\d+)_/);
  if (!match) return { status: 400, body: { error: '無效的 slotId 格式' } };
  const weekId = parseInt(match[1]);

  const week = await db.midweekWeek.findFirst({
    where: { id: weekId, congregationId: user.congregationId },
    include: { parts: true },
  });
  if (!week) return { status: 403, body: { error: '找不到週次或無權限' } };

  const before = await db.assignment.findUnique({ where: { slotId } });
  const prevName = before?.name ?? '';

  if (!name) {
    await db.assignment.deleteMany({ where: { slotId } });
  } else {
    await db.assignment.upsert({
      where: { slotId },
      create: { slotId, weekId, name },
      update: { name },
    });
  }

  const slot = describeMidweekSlot(week, slotId);
  await logChange(db, {
    congregationId: user.congregationId,
    slotId,
    date: slot?.date ?? week.date,
    label: slot?.label ?? slotId,
    prevName,
    name: name ?? '',
    actorName: user.displayName,
  });

  return { status: 200, body: { ok: true } };
}

// Patch a weekend row's allowed fields and log changes to name-bearing fields.
// Assumes auth + row lookup already done (`existing` is the current DB row).
export async function applyWeekendPatch(db, user, existing, body) {
  const data = {};
  for (const [key, val] of Object.entries(body ?? {})) {
    if (ALLOWED_WEEKEND_FIELDS.has(key)) data[key] = val ?? '';
  }
  if (!Object.keys(data).length) return { status: 400, body: { error: '沒有可更新的欄位' } };

  const row = await db.weekendRow.update({ where: { id: existing.id }, data });

  for (const field of WEEKEND_NAME_FIELDS) {
    if (field in data) {
      await logChange(db, {
        congregationId: user.congregationId,
        slotId: `we${existing.id}_${field}`,
        date: row.date,
        label: weekendFieldLabel(field),
        prevName: existing[field] ?? '',
        name: data[field] ?? '',
        actorName: user.displayName,
      });
    }
  }

  return { status: 200, body: { ok: true, row } };
}
