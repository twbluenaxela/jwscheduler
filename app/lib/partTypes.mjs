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
