// Pure builder for the ✦ suggest engine's `pastHistory` rows.
//
// Lives here (not inline in the route) so it can be unit-tested: the route's
// previous hand-rolled regexes are exactly where added parts (`x_<32 hex>`)
// were silently lost from the fairness history.
//
// Input: midweek weeks from Prisma with `parts` + `assignments` included.
// Output: [{ name, cat, date|isoDate, type?, role?, pairId? }]
import { partTypeOf, slotCat } from './partTypes.mjs';
import { parseMidweekSlotId } from './slotId.mjs';

const ROLE_TO_CAT = { chairman: 'chairman', openPrayer: 'prayer', closePrayer: 'prayer' };

export function buildSuggestPastHistory(historyWeeks) {
  const pastHistory = [];
  for (const w of historyWeeks ?? []) {
    const partMap = new Map((w.parts ?? []).map((p) => [p.partKey, p]));
    for (const a of w.assignments ?? []) {
      // One parser for every slot shape: a partKey may itself contain
      // underscores (`x_<32 hex>` for parts added in 基督徒的生活), so slicing
      // the id by hand drops those assignments out of the history.
      const parsed = parseMidweekSlotId(a.slotId);
      if (!parsed || parsed.weekId !== w.id) continue;
      if (parsed.key) {
        pastHistory.push({ name: a.name, cat: ROLE_TO_CAT[parsed.key], date: w.date, isoDate: w.isoDate });
        continue;
      }
      if (parsed.index === null) continue;
      const part = partMap.get(parsed.partKey);
      if (!part) continue;
      // pairId groups the two halves of one pair-capable part so the engine can
      // recover 學生／助手 pairings (who served WITH whom).
      pastHistory.push({
        name: a.name,
        cat: slotCat(part, parsed.index),
        date: w.date,
        isoDate: w.isoDate,
        type: part.cat === 'ministry' ? partTypeOf(part.title) : null,
        role: String(parsed.index),
        pairId: String(part.roleLabel ?? '').includes('/') ? `${w.id}_${parsed.partKey}` : null,
      });
    }
  }
  return pastHistory;
}
