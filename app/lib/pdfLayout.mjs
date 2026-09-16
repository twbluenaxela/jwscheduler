// Geometry for the "N weeks per PDF page" export.
//
// Pure and DB-free, so the grid picker's on-screen ghost preview and the PDF it
// produces are computed by the SAME code — a preview that lies about where the
// cards land is worse than no preview at all.
//
// A cancelled week (國際大會 / 總部代表 …) is the exception to "N per page": it
// becomes a full-width notice band and does NOT consume one of the N boxes, so
// the weeks that do have a meeting still pair up the way the user chose.

import { isMidweekSuspended } from './weekType.mjs';

export const A4_PT = { w: 595.28, h: 841.89 };
export const MARGIN = 24;
export const GAP = 14;

// A full-width 「本週聚會暫停」 band. Fixed height: it holds two lines of text, so
// giving it an equal share of the page would waste most of a sheet.
export const NOTICE_H = 64;

// 2×2 is the ceiling: a week card on A4 portrait is unreadable any smaller, so
// the picker is a 2×2 grid rather than a bigger one with most cells greyed out.
export const MAX_ROWS = 2;
export const MAX_COLS = 2;
export const MAX_BOXES = MAX_ROWS * MAX_COLS;
export const DEFAULT_LAYOUT = { rows: 2, cols: 1, count: 2 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Enforces 1 <= count <= rows*cols, with rows and cols each at most 2.
export function normalizeLayout(layout) {
  const rows = clamp(Math.round(layout?.rows ?? DEFAULT_LAYOUT.rows) || 1, 1, MAX_ROWS);
  const cols = clamp(Math.round(layout?.cols ?? DEFAULT_LAYOUT.cols) || 1, 1, MAX_COLS);
  const count = clamp(Math.round(layout?.count ?? rows * cols) || 1, 1, rows * cols);
  return { rows, cols, count };
}

// The grid that holds `count` boxes. Stacked rows win while they fit, because a
// full-width card is far more readable than a half-width one; only the fourth
// box forces a second column.
function gridFor(count) {
  if (count <= 1) return { rows: 1, cols: 1 };
  if (count === 2) return { rows: 2, cols: 1 };
  return { rows: 2, cols: 2 };
}

export function setCount(count) {
  const n = clamp(Math.round(count) || 1, 1, MAX_BOXES);
  return { ...gridFor(n), count: n };
}

// The + button: one more week per page, growing the grid only when it must.
// Returns the layout unchanged once MAX_BOXES is reached.
export function addBox(layout) {
  const { count } = normalizeLayout(layout);
  return count >= MAX_BOXES ? normalizeLayout(layout) : setCount(count + 1);
}

// The - button. Never goes below a single box.
export function removeBox(layout) {
  const { count } = normalizeLayout(layout);
  return count <= 1 ? normalizeLayout(layout) : setCount(count - 1);
}

/* ===================== Page packing ===================== */

// Splits weeks into pages of `bands`, top to bottom:
//   { kind: 'weeks',  items: [weekIndex, …] }  — up to `cols` cards side by side
//   { kind: 'notice', item: weekIndex }        — a cancelled week, full width
export function paginate(weeks, layout, isSuspended = isMidweekSuspended) {
  const { cols, count } = normalizeLayout(layout);
  const list = weeks ?? [];
  const pages = [];
  let page = null;
  let scheduled = 0;

  const open = () => { page = { bands: [] }; scheduled = 0; pages.push(page); };

  list.forEach((week, index) => {
    if (!page) open();
    if (isSuspended(week)) {
      page.bands.push({ kind: 'notice', item: index });
      return;
    }
    if (scheduled >= count) open();
    const last = page.bands[page.bands.length - 1];
    if (last?.kind === 'weeks' && last.items.length < cols) last.items.push(index);
    else page.bands.push({ kind: 'weeks', items: [index] });
    scheduled += 1;
  });

  return pages.filter((p) => p.bands.length > 0);
}

/* ===================== Placement ===================== */

// Lays a page's bands out in PDF points, origin BOTTOM-LEFT (PDF's convention).
//
// `sizes` maps a week index to its captured image's { width, height } in pixels.
//
// EVERYTHING ON A PAGE SCALES AS ONE BLOCK. Each band is first given the height
// its content naturally wants at the full column width; if the stack is taller
// than the page, every band — cancelled weeks included — is multiplied by the
// SAME factor. That single factor is what gives the page visual unity: because
// each element then contain-fits a cell of `cellW × natural × shrink`, they all
// come out exactly `cellW * shrink` wide and share the same left and right
// edges.
//
// An earlier version shrank only the week bands and left the notice at the full
// page width, so on a crowded page the one-line cancelled-week band was WIDER
// than the week cards above it.
export function placeCells(page, layout, sizes = {}) {
  const { cols } = normalizeLayout(layout);
  const bands = page?.bands ?? [];
  const innerW = A4_PT.w - 2 * MARGIN;
  const innerH = A4_PT.h - 2 * MARGIN;
  // With one column a cell is the whole text width, so a notice does span the
  // page. With two, it is one column wide and cannot cut the grid in half.
  const cellW = (innerW - (cols - 1) * GAP) / cols;
  const gaps = Math.max(0, bands.length - 1) * GAP;

  // The height this item wants at full cell width, or null if we never captured
  // it (a failed capture must still reserve its place, or every later card
  // shifts into the wrong box).
  const wantedH = (item) => {
    const size = sizes[item];
    if (!(size?.width > 0 && size?.height > 0)) return null;
    return (cellW * size.height) / size.width;
  };

  const natural = bands.map((band) => {
    if (band.kind === 'notice') {
      // A cancelled week is a thin rule between the real weeks, never a
      // card-sized block: it carries one line of text.
      const h = wantedH(band.item);
      return h === null ? NOTICE_H : Math.min(NOTICE_H, h);
    }
    const heights = band.items.map(wantedH).filter((h) => h !== null);
    return heights.length ? Math.max(...heights) : null;
  });

  // Bands whose size we don't know share out whatever the known ones leave.
  const knownTotal = natural.reduce((t, h) => t + (h ?? 0), 0);
  const unknown = natural.filter((h) => h === null).length;
  const share = unknown ? Math.max(1, (innerH - gaps - knownTotal) / unknown) : 0;
  const wanted = natural.map((h) => (h === null ? share : h));

  const total = wanted.reduce((t, h) => t + h, 0);
  const shrink = total > innerH - gaps ? Math.max(0, (innerH - gaps) / total) : 1;
  const bandH = wanted.map((h) => h * shrink);
  const used = bandH.reduce((t, h) => t + h, 0) + gaps;

  const out = [];
  // PDF's y grows upwards, so walk from the top of the page downwards, with the
  // whole block centred in whatever room it does not use.
  let top = A4_PT.h - MARGIN - Math.max(0, (innerH - used) / 2);

  // Contain-fit, centred in the cell.
  const fit = (kind, item, cellX, cellTop, cellH) => {
    const size = sizes[item];
    let w = cellW;
    let h = cellH;
    if (size?.width > 0 && size?.height > 0) {
      const scale = Math.min(cellW / size.width, cellH / size.height);
      w = size.width * scale;
      h = size.height * scale;
    }
    out.push({
      kind,
      item,
      x: cellX + (cellW - w) / 2,
      y: cellTop - cellH + (cellH - h) / 2,
      w,
      h,
    });
  };

  bands.forEach((band, b) => {
    const h = bandH[b];
    if (band.kind === 'notice') {
      fit('notice', band.item, MARGIN, top, h);
    } else {
      band.items.forEach((weekIndex, i) => {
        fit('week', weekIndex, MARGIN + i * (cellW + GAP), top, h);
      });
    }
    top -= h + GAP;
  });

  return out;
}

// How many pages the current selection will produce — shown live in the picker.
export function pageCount(weeks, layout, isSuspended = isMidweekSuspended) {
  return paginate(weeks, layout, isSuspended).length;
}
