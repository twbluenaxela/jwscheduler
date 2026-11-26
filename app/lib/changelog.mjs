// Helpers for the 最近變更 (recent-changes) log shown in 總覽.
// The label resolvers are pure (unit-tested); `logChange` takes the Prisma
// client as an argument so this module stays import-safe for `node --test`.

import { parseMidweekSlotId } from './slotId.mjs';

const SECTION_LABELS = { chairman: '主席', openPrayer: '開始禱告', closePrayer: '結束禱告' };

// Resolve a midweek slotId (e.g. "mw42_chairman", "mw42_cbs1_1",
// "mw37_x_0123…_0") to a human { date, label } using the week and its parts.
// Mirrors the PairSlot labels. Part keys may contain underscores, so the ID is
// split by the shared parser, never by string slicing.
export function describeMidweekSlot(week, slotId) {
  if (!week) return null;
  const parsed = parseMidweekSlotId(slotId);
  if (!parsed || parsed.weekId !== Number(week.id)) return null;

  if (parsed.key) return { date: week.date, label: SECTION_LABELS[parsed.key] };
  if (parsed.index === null) return { date: week.date, label: parsed.partKey };

  const partKey = parsed.partKey;
  const idx = parsed.index;
  const part = (week.parts ?? []).find((p) => p.partKey === partKey);
  if (!part) return { date: week.date, label: partKey };

  const rls = part.roleLabel?.split('/') ?? [];
  const base = part.cbsRef ? `${part.title}（${part.cbsRef}）` : part.title;
  if (idx === 1) return { date: week.date, label: `${base}（${rls[1] ?? '助手'}）` };
  return { date: week.date, label: rls[0] ? `${base}（${rls[0]}）` : base };
}

const WEEKEND_FIELD_LABELS = { speaker: '公眾演講', chair: '主席', wt: '守望台主持', read: '朗讀', host: '招待' };

// The weekend-row fields that hold a person's name (worth logging).
export const WEEKEND_NAME_FIELDS = ['speaker', 'chair', 'wt', 'read', 'host'];

export function weekendFieldLabel(field) { return WEEKEND_FIELD_LABELS[field] ?? field; }

// Classify a name change. Returns null when nothing actually changed.
export function changeAction(prevName, name) {
  const prev = prevName || '';
  const next = name || '';
  if (prev === next) return null;
  if (!prev) return 'assign';
  if (!next) return 'clear';
  return 'reassign';
}

// Best-effort change-log write. Never throws — a logging failure must not break
// the underlying assignment write.
export async function logChange(db, { congregationId, slotId, date, label, prevName, name, actorName }) {
  const action = changeAction(prevName, name);
  if (!action) return;
  try {
    await db.changeLog.create({
      data: {
        congregationId,
        slotId,
        date: date ?? '',
        label: label ?? '',
        prevName: prevName || null,
        name: name || null,
        action,
        actorName: actorName || null,
      },
    });
  } catch {
    // swallow — the assignment itself already succeeded
  }
}
