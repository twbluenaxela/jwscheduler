// The one date layer for schedule rows. Everything that needs to know "what
// day is this week/row?" must come through here, so the year can never be
// interpreted two different ways in two different screens.
//
// Two tiers, in order of trust:
//
//   1. `isoDate` — a real "YYYY-MM-DD" stored on the row. Unambiguous. Set by
//      the EPUB import (which knows the year from the file name) and by
//      `scripts/backfill-iso-dates.mjs` for rows imported before that existed.
//   2. `date` — the legacy display string ("6月 3日" / "8/9"), which carries NO
//      year, so one has to be inferred from "now" with a ±6-month window. That
//      only spans ~12 months, cannot represent two service years at once, and
//      silently mis-dates anything further out.
//
// Prefer `resolveRowDate(row)`. `parseCnDate` remains for the legacy strings
// and as the fallback while rows are still being backfilled.

// Parse a stored "YYYY-MM-DD" into a local-midnight Date. Local, not UTC, so it
// compares correctly against `new Date()` elsewhere in the app.
export function parseIsoDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str ?? '').trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Date -> "YYYY-MM-DD" using LOCAL parts (toISOString would shift the day for
// UTC+8, turning 2026-08-22 into 2026-08-21).
export function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// Accepts "6月 3日" (midweek weeks) and "8/9" (weekend rows).
// The year is inferred relative to `ref` with a ±6-month window, so a December
// date read from a January reference resolves to the previous year.
export function parseCnDate(str, ref = new Date()) {
  const s = String(str ?? '');
  const m = s.match(/(\d+)月\s*(\d+)日/) ?? s.match(/^(\d+)\/(\d+)$/);
  if (!m) return null;
  let yr = ref.getFullYear();
  const mo = +m[1];
  if (mo > ref.getMonth() + 7) yr--;
  else if (mo < ref.getMonth() - 5) yr++;
  return new Date(yr, mo - 1, +m[2]);
}

// THE resolver: a stored isoDate wins; otherwise fall back to inferring the
// year from the display string. Accepts a row object or a bare string.
export function resolveRowDate(row, ref = new Date()) {
  if (row == null) return null;
  if (typeof row === 'string') return parseCnDate(row, ref);
  return parseIsoDate(row.isoDate) ?? parseCnDate(row.date, ref);
}

// Chinese display label for a real date, matching the stored `date` format.
export function toCnLabel(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}月 ${date.getDate()}日`;
}

// Assign real years to a chronologically-ordered run of year-less rows.
//
// The strings only carry month/day, but a schedule is imported in order, so the
// year can be recovered by walking it: whenever the month goes DOWN relative to
// the previous row, a year boundary was crossed. `anchor` fixes the absolute
// year — for an EPUB that is the year in its file name; for a backfill it is
// the year of the row nearest today.
//
// Returns an array of Dates aligned with `rows` (null where unparseable).
export function resolveSequenceYears(rows, { anchorIndex = 0, anchorYear } = {}) {
  const parts = rows.map((r) => {
    const s = typeof r === 'string' ? r : String(r?.date ?? '');
    const m = s.match(/(\d+)月\s*(\d+)日/) ?? s.match(/^(\d+)\/(\d+)$/);
    return m ? { mo: +m[1], day: +m[2] } : null;
  });

  // Relative year offsets, walking forward from the anchor and backward from it.
  const offset = new Array(rows.length).fill(null);
  const first = parts.findIndex(Boolean);
  if (first === -1) return rows.map(() => null);

  offset[first] = 0;
  for (let i = first + 1; i < rows.length; i++) {
    if (!parts[i]) continue;
    let prev = i - 1;
    while (prev >= 0 && !parts[prev]) prev--;
    if (prev < 0) { offset[i] = 0; continue; }
    offset[i] = offset[prev] + (parts[i].mo < parts[prev].mo ? 1 : 0);
  }

  const anchorOffset = offset[anchorIndex] ?? offset[first] ?? 0;
  const baseYear = anchorYear ?? new Date().getFullYear();
  return parts.map((p, i) =>
    p && offset[i] != null ? new Date(baseYear + offset[i] - anchorOffset, p.mo - 1, p.day) : null
  );
}
