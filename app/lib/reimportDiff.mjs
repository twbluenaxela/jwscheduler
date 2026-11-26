// Pure diff between an existing DB week and an incoming EPUB week.
//
// Used by the import review screen to tell the admin what changed before they
// choose 保留 vs 捨棄. No DB, no React — fully unit-testable.
//
// Shapes:
//   existing  — a mapped week from the app: { date, treasures:[{id,title,dur,
//                roleLabel,hideHelper,assign}], ministry:[...], living:[...] }
//   incoming  — a parsed EPUB week: { date, treasures:[{id,title,dur,
//                roleLabel,...}], ministry:[...], living:[...] } (no hideHelper
//                field → treated as not hidden)
//
// `diffWeek(existing, incoming)` returns:
//   { added: Part[], deleted: Part[], retitled: string[], durChanged: string[],
//     helperChanged: string[], clearedAssignments: number, hasChanges: boolean }
// `formatDiffLine(date, diff)` returns the Traditional Chinese one-liner, e.g.
//   "12/3：新增 1 個節目、刪除「會眾研經班」、改了 2 個標題"
//   "12/10：沒有修改"
// `diffImport(existingWeeks, incomingWeeks)` pairs them up and returns
//   [{ incoming, existing, isNew, diff, line }].

const SECTIONS = ['treasures', 'ministry', 'living'];

function flatten(week) {
  const out = [];
  if (!week) return out;
  for (const section of SECTIONS) {
    for (const part of week[section] ?? []) {
      out.push({ ...part, section });
    }
  }
  return out;
}

function normDur(value) {
  return String(value ?? '').replace(/\s+/g, '').replace(/分鐘/g, '').replace(/min/gi, '').trim();
}

function isPair(part) {
  return String(part?.roleLabel ?? '').includes('/') && !part?.hideHelper;
}

function shortDate(dateStr) {
  const m = String(dateStr ?? '').match(/(\d+)月\s*(\d+)/);
  if (m) return `${Number(m[1])}/${Number(m[2])}`;
  const m2 = String(dateStr ?? '').match(/(\d+)\/(\d+)/);
  if (m2) return `${Number(m2[1])}/${Number(m2[2])}`;
  return String(dateStr ?? '').trim();
}

export function diffWeek(existing, incoming) {
  const existingParts = flatten(existing);
  const incomingParts = flatten(incoming);
  const incomingKeys = new Set(incomingParts.map((p) => p.id));
  const existingKeys = new Set(existingParts.map((p) => p.id));

  const added = existingParts.filter((p) => !incomingKeys.has(p.id));
  const deleted = incomingParts.filter((p) => !existingKeys.has(p.id));

  const retitled = [];
  const durChanged = [];
  const helperChanged = [];

  for (const ep of incomingParts) {
    const dbp = existingParts.find((p) => p.id === ep.id);
    if (!dbp) continue;
    if (String(dbp.title ?? '').trim() !== String(ep.title ?? '').trim()) retitled.push(dbp.title);
    if (normDur(dbp.dur) !== normDur(ep.dur)) durChanged.push(dbp.title);
    const dbRole = `${dbp.roleLabel ?? ''}|${dbp.hideHelper ? 1 : 0}`;
    const epRole = `${ep.roleLabel ?? ''}|${ep.hideHelper ? 1 : 0}`;
    if (dbRole !== epRole) helperChanged.push(dbp.title);
  }

  // Assignments that would be cleared under 捨棄: assignments on parts that
  // only exist in the DB (added), plus helper slots lost when a surviving part
  // goes from pair to single.
  let clearedAssignments = 0;
  for (const ap of added) {
    const slots = Array.isArray(ap.assign) ? ap.assign : [];
    clearedAssignments += slots.filter(Boolean).length;
    if (!slots.length && ap.assign == null) clearedAssignments += isPair(ap) ? 2 : 1; // best effort
  }
  for (const ep of incomingParts) {
    const dbp = existingParts.find((p) => p.id === ep.id);
    if (!dbp) continue;
    if (isPair(dbp) && !isPair(ep)) {
      const a1 = Array.isArray(dbp.assign) ? dbp.assign[1] : null;
      if (a1) clearedAssignments += 1;
    }
  }

  const hasChanges =
    added.length > 0 ||
    deleted.length > 0 ||
    retitled.length > 0 ||
    durChanged.length > 0 ||
    helperChanged.length > 0;

  return { added, deleted, retitled, durChanged, helperChanged, clearedAssignments, hasChanges };
}

export function formatDiffLine(date, diff, options = {}) {
  const d = diff ?? {};
  const mode = options.mode ?? 'keep';
  if (!d.hasChanges) {
    return `${shortDate(date)}：沒有修改`;
  }
  const parts = [];
  if ((d.added?.length ?? 0) > 0) parts.push(`新增 ${d.added.length} 個節目`);
  if ((d.deleted?.length ?? 0) > 0) {
    const titles = d.deleted.map((p) => `「${p.title}」`).join('');
    parts.push(`刪除${titles}`);
  }
  if ((d.retitled?.length ?? 0) > 0) parts.push(`改了 ${d.retitled.length} 個標題`);
  if ((d.durChanged?.length ?? 0) > 0) parts.push(`改了 ${d.durChanged.length} 個時長`);
  if ((d.helperChanged?.length ?? 0) > 0) parts.push(`改了 ${d.helperChanged.length} 個助手設定`);
  let line = `${shortDate(date)}：${parts.join('、')}`;
  if (mode === 'replace' && (d.clearedAssignments ?? 0) > 0) {
    line += `（會清除 ${d.clearedAssignments} 個指派）`;
  }
  return line;
}

export function diffImport(existingWeeks, incomingWeeks) {
  const existingByDate = new Map((existingWeeks ?? []).map((w) => [String(w.date ?? '').trim(), w]));
  return (incomingWeeks ?? []).map((incoming) => {
    const existing = existingByDate.get(String(incoming.date ?? '').trim()) ?? null;
    const isNew = !existing;
    const diff = isNew ? null : diffWeek(existing, incoming);
    let line;
    if (isNew) line = `${shortDate(incoming.date)}：新的週次，將直接匯入`;
    else line = formatDiffLine(incoming.date, diff);
    return { incoming, existing, isNew, diff, line };
  });
}
