// 職務 (appointment) options + the one rule that depends on them.
//
// This lives in its own module because THREE places have to agree about it:
// the 人員 editor's dropdown, the ✦ suggest engine (suggest.js) and the manual
// picker (candidates.mjs). The last two are two entry points to ONE decision and
// must never rank on different rules — the same reason FAMILIES lives in
// partTypes.mjs rather than inside suggest.js.
//
// 先驅 is strictly speaking a privilege, not an appointment (a 先驅 may also be
// an 長老), but the congregation asked for one flat list, so it is a value in
// the same dropdown and available to 弟兄 and 姊妹 alike.

export const OFFICE_OPTIONS = {
  M: ['分區監督', '長老', '助理僕人', '先驅', '傳道員', '未受浸傳道員'],
  F: ['先驅', '傳道員', '未受浸傳道員'],
};

export const DEFAULT_OFFICE = '傳道員';

export const PIONEER_APPT = '先驅';

export function isPioneer(person) {
  return (person?.appt ?? person?.appointment ?? '') === PIONEER_APPT;
}

// 先驅 should come up slightly more often than the rest of the pool.
//
// Both rankers already score on a gap measured in DAYS since/until a person's
// nearest assignment, so the preference is expressed in that same unit rather
// than as a second, parallel mechanism: a pioneer is ranked as though they had
// been free for a week longer than they actually have. That wins ties and
// near-ties — roughly one meeting cycle of nudge — but never promotes a pioneer
// over someone who is genuinely much less used, and it leaves the crowd/monthly
// demotions and the S-38 gender rules (which are filters, applied later)
// completely untouched.
export const PIONEER_GAP_BONUS_DAYS = 7;

export function pioneerBonus(person) {
  return isPioneer(person) ? PIONEER_GAP_BONUS_DAYS : 0;
}
