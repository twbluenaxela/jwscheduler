// Pure helpers for classifying midweek ministry parts — shared by the suggest
// engine, the suggest API route, pastHistory (AssignSheet stats) and MidweekWeek
// (which cat the picker opens with). `.mjs` so Node can unit-test it.
//
// Ministry-section 演講 parts (e.g. 解釋自己的信仰 — 演講, 演講 — 《愛心》附錄)
// are brothers-only single-slot talks, so they map to their own cat
// `ministrytalk` (tag 傳道演講, g M) instead of the mixed 傳道示範 pool.
//
// The admin's roleLabel is authoritative over the title: the EPUB can't always
// be trusted for pair-vs-single, so the edit-mode ＋/− toggle rewrites roleLabel,
// and a ministry part WITH a helper slot ('/' in roleLabel) always uses the
// mixed demo pool even if its title mentions 演講.

// Fine-grained ministry part type, used for rotation so nobody gets stuck with
// the same kind of assignment (e.g. always 初次交談). Returns null for
// non-ministry-style titles.
export function partTypeOf(title) {
  const t = String(title ?? '');
  if (t.includes('初次交談')) return '初次交談';
  if (t.includes('再次交談')) return '再次交談';
  if (t.includes('教導人成為門徒')) return '教導人成為門徒';
  if (t.includes('解釋自己的信仰')) return t.includes('演講') ? '演講' : '解釋自己的信仰';
  if (t.includes('演講')) return '演講';
  return null;
}

// The cat to use for eligibility/history for a part's STUDENT (_0) slot.
// part: { cat, title, roleLabel }
//
// Single-slot ministry parts split by roleLabel (S-38):
//   '學生' + 演講 title → talk, brothers with 傳道演講
//   no roleLabel at all → discussion part (節目包括討論, e.g. 你會怎麼說？) —
//     conducted by an elder/qualified MS → 'ministrydisc' (tag 傳道討論主持);
//     the parser leaves roleLabel unset exactly for these
export function effectiveCat(part) {
  if (part?.cat !== 'ministry') return part?.cat;
  if (String(part.roleLabel ?? '').includes('/')) return 'ministry'; // has helper → demo
  if (!part.roleLabel) return 'ministrydisc';
  return partTypeOf(part.title) === '演講' ? 'ministrytalk' : 'ministry';
}

// The cat for a specific slot of a pair-capable part: the CBS reader (_1)
// draws from 研經班朗讀, not the conductor pool.
export function slotCat(part, slotIdx) {
  if (part?.cat === 'cbs' && String(slotIdx) === '1') return 'cbsread';
  return effectiveCat(part);
}

// ── Assignment families ──────────────────────────────────────────────────────
// Some cats are, in the members' eyes, "the same kind of turn", so they share
// ONE recency history: "when did this person last do anything in this family",
// never "when did they last do this exact cat". A different title or pool must
// not make a recently-used person look due.
//
// Per-cat eligibility (tag + gender) is UNCHANGED — a family shares history,
// not candidates: 研經班朗讀 still needs the 研經班朗讀 qual.
//
// Member feedback behind this: 學生練習與朗讀安排整個月份內人員盡量不要重複.
//   ministry — 用心準備傳道工作 student practice: 初次交談 / 再次交談 /
//     解釋自己的信仰 / 教導人成為門徒 (cat 'ministry') + the single-slot 演講
//     talks ('ministrytalk'). The per-title distinction survives in `type`
//     (records + the suggest engine's rotation tiebreak) — it just no longer
//     decides who is due.
//   reading — 朗讀 duties: 經文朗讀 ('reading') + 研經班朗讀 ('cbsread').
// Cats NOT listed (chairman, prayer, treasures, gems, living, cbs,
// ministrydisc, and the weekend cats) keep per-cat behaviour.
//
// This lives here, not in suggest.js, because BOTH entry points to the same
// decision must agree: the ✦ suggest engine and the manual AssignSheet picker.
// (A reviewer caught them diverging — the picker was still ranking per-cat and
// labelling a brother who read at 研經班 six weeks ago as 從未擔任此項.)
export const FAMILIES = {
  ministry: ['ministry', 'ministrytalk'],
  reading: ['reading', 'cbsread'],
};

// cat -> family key (cats with no family are absent)
export const FAMILY_OF = new Map(
  Object.entries(FAMILIES).flatMap(([fam, cats]) => cats.map(c => [c, fam]))
);

// The cats whose history counts toward this cat's recency — the family's cats,
// or just the cat itself when it belongs to no family.
export function familyCats(catKey) {
  const fam = FAMILY_OF.get(catKey);
  return fam ? FAMILIES[fam] : (catKey ? [catKey] : []);
}
