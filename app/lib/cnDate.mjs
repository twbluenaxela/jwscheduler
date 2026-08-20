// The one Chinese/slash date parser used by the scheduling helpers
// (pastHistory, suggest, pairHistory). Kept in one place so the year-inference
// rule cannot drift between the picker and the star-suggest engine - they must
// agree on what "6月 3日" means, or the stats shown and the suggestion made
// disagree.
//
// Accepts "6月 3日" (midweek weeks) and "8/9" (weekend rows).
// The year is inferred relative to `ref` with a plus/minus 6-month window, so a
// December date read from a January reference resolves to the previous year.
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
