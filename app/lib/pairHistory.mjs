// Pure helpers for 學生／助手 pairing history - no DB, no React, no fetch.
//
// 傳道示範 parts put two sisters together (學生 + 助手). Beyond rotating WHO
// serves, the congregation wants to rotate WHO SERVES WITH WHOM: the same two
// sisters paired again a few weeks later wastes the variety the pool allows.
// A repeat is allowed - it is a warning and a demotion, never a block - but
// only once the pair has had time to breathe.
import { parseCnDate, resolveRowDate } from './cnDate.mjs';

export const PAIR_REPEAT_WINDOW_DAYS = 180;

// Order-independent key: 甲+乙 and 乙+甲 are the same pairing. The separator is
// a NUL, which cannot occur in a name (unlike '+' or '|').
const SEP = '\u0000';
export function pairKey(a, b) {
  return [String(a ?? ''), String(b ?? '')].sort().join(SEP);
}

// pairs: [{ a, b, date }] where date is a Date.
// Returns Map<key, number[]> of pairing timestamps, ascending.
export function buildPairIndex(pairs) {
  const idx = new Map();
  for (const p of pairs ?? []) {
    if (!p?.a || !p?.b || !p.date || p.a === p.b) continue;
    const k = pairKey(p.a, p.b);
    const arr = idx.get(k) ?? [];
    arr.push(+p.date);
    idx.set(k, arr);
  }
  for (const arr of idx.values()) arr.sort((x, y) => x - y);
  return idx;
}

// The nearest time `a` and `b` were paired, in EITHER direction from `ref`
// (a pairing already booked for next month counts exactly like one last month -
// the same bidirectional rule the fairness gap uses). A pairing ON `ref` itself
// is the assignment being edited and is ignored.
// Returns null when they have never been paired inside the window.
export function recentPairing(index, a, b, ref, windowDays = PAIR_REPEAT_WINDOW_DAYS) {
  if (!index || !a || !b || a === b) return null;
  const arr = index.get(pairKey(a, b));
  if (!arr?.length) return null;
  const refMs = +ref;
  const win = windowDays * 86400000;
  let best = null;
  for (const t of arr) {
    const diff = t - refMs;
    if (diff === 0 || Math.abs(diff) > win) continue;
    if (best === null || Math.abs(diff) < Math.abs(best)) best = diff;
  }
  if (best === null) return null;
  return { days: Math.floor(Math.abs(best) / 86400000), future: best > 0, count: arr.length };
}

// Every name paired with `name` within the window - the demotion set the
// suggestion engine applies to the counterpart slot.
export function partnersWithin(index, name, ref, windowDays = PAIR_REPEAT_WINDOW_DAYS) {
  const out = new Set();
  if (!index || !name) return out;
  const refMs = +ref;
  const win = windowDays * 86400000;
  for (const [k, arr] of index) {
    const [x, y] = k.split(SEP);
    if (x !== name && y !== name) continue;
    const other = x === name ? y : x;
    if (other === name) continue;
    if (arr.some(t => t - refMs !== 0 && Math.abs(t - refMs) <= win)) out.add(other);
  }
  return out;
}

// Client-side collection: walk mapped midweek weeks + the assignments map and
// pull out both halves of every pair-capable part that has BOTH slots filled.
// `cats` limits which part categories count (傳道示範 demos by default - the
// 研經班 主持/朗讀 pools are far smaller, so pair repeats there are unavoidable
// and warning about them would be noise).
export function collectMidweekPairs(midweekWeeks, assignments, cats = ['ministry']) {
  const allow = new Set(cats);
  const out = [];
  const ref = new Date();
  for (const w of midweekWeeks ?? []) {
    const date = parseCnDate(w.date, ref);
    if (!date) continue;
    const parts = [...(w.treasures ?? []), ...(w.ministry ?? []), ...(w.living ?? []), ...(w.parts ?? [])];
    for (const part of parts) {
      if (!allow.has(part.cat)) continue;
      if (!String(part.roleLabel ?? '').includes('/')) continue;
      const a = assignments?.[`mw${w.id}_${part.id}_0`];
      const b = assignments?.[`mw${w.id}_${part.id}_1`];
      if (a && b) out.push({ a, b, date });
    }
  }
  return out;
}

// The name holding the OTHER half of the pair-capable part that `slotId`
// belongs to — the person a candidate for this slot would be paired with.
// Returns '' for non-pair parts, non-demo parts, or when the other half is
// still empty. slotId shape: mw{weekId}_{partKey}_{0|1}.
export function counterpartName(slotId, midweekWeeks, assignments, cats = ['ministry']) {
  const m = String(slotId ?? '').match(/^mw(\d+)_(.+)_([01])$/);
  if (!m) return '';
  const [, weekId, partKey, idx] = m;
  const w = (midweekWeeks ?? []).find(wk => String(wk.id) === weekId);
  if (!w) return '';
  const parts = [...(w.treasures ?? []), ...(w.ministry ?? []), ...(w.living ?? []), ...(w.parts ?? [])];
  const part = parts.find(p => p.id === partKey);
  if (!part || !cats.includes(part.cat)) return '';
  if (!String(part.roleLabel ?? '').includes('/')) return '';
  return assignments?.[`mw${weekId}_${partKey}_${idx === '0' ? '1' : '0'}`] ?? '';
}
