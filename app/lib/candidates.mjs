// Pure candidate ranking for the manual picker (AssignSheet) — no React, so it
// can be unit-tested next to the ✦ suggest engine it has to agree with.
//
// The two entry points to the same decision are the ✦ button (app/lib/suggest.js)
// and this sheet. They MUST rank on the same notion of recency: a reviewer caught
// them diverging after assignment families were introduced — the engine ranked
// 經文朗讀 on the whole 朗讀 family while this picker still ranked per-cat and
// offered a brother who read at 研經班 six weeks ago as 從未擔任此項.
import { CATS } from '../data/index.js';
import { recentPairing } from './pairHistory.mjs';
import { familyCats } from './partTypes.mjs';

export function buildCandidates(people, catKey, jitter, spread, pastHistory, pair) {
  const c = CATS[catKey];
  if (!c || !people?.length) return [];
  const sibCats = familyCats(catKey);
  return people
    .filter(p => p.status !== 'inactive' && p.quals.includes(c.tag) && (c.g === 'any' || p.g === c.g))
    .map(p => {
      const entry = pastHistory?.[p.name]?.[c.tag];
      // daysSince/daysUntil are precomputed relative to the slot's date in
      // buildPastHistory. The weight uses the BIDIRECTIONAL gap: someone
      // already booked for this part in an upcoming week ranks like someone
      // who just served — otherwise editing an earlier week double-books them.
      const d = entry?.daysSince ?? null;
      const u = entry?.daysUntil ?? null;
      const load = entry?.halfYearCount ?? 0;
      // FAMILY recency (partTypes.mjs): for 用心準備傳道工作 and 朗讀 cats the
      // sibling cat's turns count too, so a brother who read at 研經班 six weeks
      // ago is not offered as "從未擔任此項" for 經文朗讀. This must match the
      // ✦ engine, which ranks family cats on the union of the family's history —
      // the two entry points to the same decision have to agree.
      let famGap = null, famVia = null;
      for (const fc of sibCats) {
        const fe = pastHistory?.[p.name]?.[CATS[fc]?.tag];
        for (const g of [fe?.daysSince, fe?.daysUntil]) {
          if (g != null && (famGap === null || g < famGap)) { famGap = g; famVia = fc; }
        }
      }
      // Nearest assignment in ANY category — warns when the person is busy
      // with a different part around this date.
      let anyGap = null;
      for (const e of Object.values(pastHistory?.[p.name] ?? {})) {
        for (const g of [e.daysSince, e.daysUntil]) {
          if (g != null && (anyGap === null || g < anyGap)) anyGap = g;
        }
      }
      const gap = Math.min(d ?? 9999, u ?? 9999, famGap ?? 9999);
      let w = Math.pow(gap, spread);
      const recent = d !== null && d < 14;
      const soon = u !== null && u < 14;
      const busyNearby = !recent && !soon && anyGap !== null && anyGap < 7;
      if (recent || soon) w *= 0.1;
      else if (busyNearby) w *= 0.3;
      // 學生／助手 variety: already paired with this slot's counterpart inside
      // the window → knocked down the list, but still pickable.
      const paired = pair?.with
        ? recentPairing(pair.index, p.name, pair.with, pair.ref)
        : null;
      if (paired) w *= 0.25;
      if (jitter) w *= 0.55 + Math.random() * 0.9;
      // Only worth showing when the family turn is the NEARER one and it was in
      // a different cat — otherwise the per-cat line above already says it.
      const viaFamily = famVia && famVia !== catKey && famGap != null && famGap < (d ?? 9999)
        ? { days: famGap, name: CATS[famVia]?.name ?? famVia }
        : null;
      return { n: p.name, g: p.g, a: p.appt, d, u, w, recent, soon, busyNearby, load, paired, viaFamily };
    })
    .sort((a, b) => b.w - a.w);
}
