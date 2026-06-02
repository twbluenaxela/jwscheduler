// Helpers for the 最近變更 (recent-changes) log shown in 總覽.
// The label resolvers are pure (unit-tested); `logChange` takes the Prisma
// client as an argument so this module stays import-safe for `node --test`.

const SECTION_LABELS = { chairman: '主席', openPrayer: '開始禱告', closePrayer: '結束禱告' };

// Resolve a midweek slotId (e.g. "mw42_chairman", "mw42_cbs1_1") to a human
// { date, label } using the week and its parts. Mirrors the PairSlot labels.
export function describeMidweekSlot(week, slotId) {
  if (!week) return null;
  const prefix = `mw${week.id}_`;
  if (!String(slotId).startsWith(prefix)) return null;
  const rest = slotId.slice(prefix.length);

  if (SECTION_LABELS[rest]) return { date: week.date, label: SECTION_LABELS[rest] };

  const m = rest.match(/^(.+)_(\d+)$/);
  if (!m) return { date: week.date, label: rest };
  const [, partKey, idxStr] = m;
  const idx = Number(idxStr);
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
