// Shared assignment-preference rules for the automatic suggester and the
// manual candidate sheet. A preferred interval is a strong demotion, never a
// hard exclusion: small qualification pools must still be able to fill a slot.

export const MAX_ASSIGNMENT_INTERVAL_MONTHS = 24;
export const DAYS_PER_ASSIGNMENT_MONTH = 30;
export const ASSIGNMENT_INTERVAL_WEIGHT = 0.02;

export function normalizeAssignmentIntervalMonths(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(MAX_ASSIGNMENT_INTERVAL_MONTHS, Math.round(number)));
}

export function assignmentIntervalInfo(person, nearestGapDays) {
  const months = normalizeAssignmentIntervalMonths(person?.assignmentIntervalMonths);
  if (!months || nearestGapDays == null || !Number.isFinite(nearestGapDays)) return null;

  const targetDays = months * DAYS_PER_ASSIGNMENT_MONTH;
  if (nearestGapDays >= targetDays) return null;

  return {
    months,
    nearestGapDays,
    targetDays,
    daysRemaining: targetDays - nearestGapDays,
  };
}
