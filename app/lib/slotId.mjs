// THE parser for midweek slot IDs — one implementation, imported everywhere.
//
// Slot ID convention (CLAUDE.md):
//   mw{weekId}_{section}          e.g. mw42_chairman, mw42_openPrayer
//   mw{weekId}_{partKey}_{n}      e.g. mw42_t0_0, mw42_m0_1
//
// A partKey may itself CONTAIN UNDERSCORES: parts added in 基督徒的生活 get
// `x_<32 hex>` (see app/api/midweek-weeks/[id]/parts/route.js), so a real slot
// is `mw37_x_0123abcd…_0`. Any code that does `slotId.split('_')[1]` reads
// `'x'` instead of the partKey — that is how assignments to added parts silently
// dropped out of the fairness history. Parse here, nowhere else.
//
// Returns:
//   { weekId: 42, key: 'chairman', partKey: null, index: null }
//   { weekId: 37, key: null, partKey: 'x_0123…', index: 0 }
//   { weekId: 37, key: null, partKey: 'cbs', index: null }   (no trailing index)
//   null for anything that is not a midweek slot.

const SECTION_KEYS = new Set(['chairman', 'openPrayer', 'closePrayer']);

export function parseMidweekSlotId(slotId) {
  const match = String(slotId ?? '').match(/^mw(\d+)_(.+)$/);
  if (!match) return null;

  const weekId = Number(match[1]);
  const rest = match[2];
  if (SECTION_KEYS.has(rest)) return { weekId, key: rest, partKey: null, index: null };

  // Greedy `(.+)` so a partKey ending in `_<digits>` keeps all but the LAST
  // `_<digits>` — the trailing one is the slot index.
  const part = rest.match(/^(.+)_(\d+)$/);
  if (!part) return { weekId, key: null, partKey: rest, index: null };
  return { weekId, key: null, partKey: part[1], index: Number(part[2]) };
}

// Build a midweek slot ID. `index` omitted → the section form.
export function buildMidweekSlotId(weekId, partKey, index) {
  const base = `mw${weekId}_${partKey}`;
  return index === undefined || index === null ? base : `${base}_${index}`;
}
