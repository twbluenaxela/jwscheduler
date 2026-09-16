// THE definition of "this week's midweek meeting is cancelled".
//
// The card, the Excel exporter and the PDF exporter all have to agree on this —
// a week that prints as a one-line 「本週聚會暫停」 notice must also be skipped by
// the page packer, or the two-weeks-per-page spreads drift apart. So the rule
// lives in one pure module and everyone imports it (same reason FAMILIES lives
// in partTypes.mjs rather than inside suggest.js).
//
// `type` is a free String column on MidweekWeek, so adding 'suspended' needed no
// migration. 'assembly' predates it and means the same thing in practice (總覽
// already collapses assembly weeks to a suspended row), so both count.

export const MIDWEEK_TYPES = ['normal', 'special', 'assembly', 'suspended'];

export const MIDWEEK_TYPE_LABELS = {
  normal: '一般',
  special: '特別',
  assembly: '大會',
  suspended: '暫停',
};

// Labels that mean "no midweek meeting this week". Editable in one place —
// 總部代表 is here because this congregation cancels the midweek for it; move it
// to SPECIAL_KEYWORDS if that ever changes.
export const SUSPEND_KEYWORDS = ['國際大會', '區域大會', '分區大會', '大會', '總部代表'];

// Labels that mean "the meeting happens, but the programme differs".
export const SPECIAL_KEYWORDS = ['分區監督', '探訪', '特別演講', '特別聚會'];

export function midweekType(week) {
  const type = week?.type ?? 'normal';
  return MIDWEEK_TYPES.includes(type) ? type : 'normal';
}

export function isMidweekSuspended(week) {
  const type = midweekType(week);
  return type === 'assembly' || type === 'suspended';
}

// A DEFAULT for the type chip, derived from the free-text label the admin typed.
// Never overrides a type the admin picked explicitly — callers only apply it
// while the week is still 'normal'. Returns null when nothing matches.
export function suggestTypeFromLabel(label) {
  const text = String(label ?? '').trim();
  if (!text) return null;
  // Check the narrower list first: 「分區監督探訪」 contains neither list's other
  // entries, but a future keyword could overlap and 特別 is the safer default.
  if (SPECIAL_KEYWORDS.some((kw) => text.includes(kw))) return 'special';
  if (SUSPEND_KEYWORDS.some((kw) => text.includes(kw))) return 'suspended';
  return null;
}

// The line printed on a cancelled week, in the card and in every export.
export function suspendedNotice(week) {
  const label = String(week?.label ?? '').trim();
  return label ? `本週聚會暫停 — ${label}` : '本週聚會暫停';
}

// Convenience for the exporters: how many of these weeks actually occupy a slot.
export function countScheduledWeeks(weeks) {
  return (weeks ?? []).filter((w) => !isMidweekSuspended(w)).length;
}
