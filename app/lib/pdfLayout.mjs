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
// `sizes` maps a week index to its captured image's { width, height } in pixels;
// each card is scaled to fit its cell without distortion (contain) and centred.
// A week with no captured image still reserves its cell, so one failed capture
// cannot shuffle every later card into the wrong box.
export function placeCells(page, layout, sizes = {}) {
  const { cols } = normalizeLayout(layout);
  const bands = page?.bands ?? [];
  const innerW = A4_PT.w - 2 * MARGIN;
  const innerH = A4_PT.h - 2 * MARGIN;
  const cellW = (innerW - (cols - 1) * GAP) / cols;

  // A cancelled week is a THIN rule between the real weeks, never a card-sized
  // block: it carries one line of text, and a block-sized slab in the middle of
  // the page looked like a broken card.
  //
  // It spans the full page only in a SINGLE-column layout. With two columns the
  // cards are half-width, so a notice stretching the whole way across cuts the
  // grid in half and reads as a divider between sections rather than as one of
  // the weeks. There it takes one column's width instead.
  const noticeW = cols > 1 ? cellW : innerW;
  const noticeH = (band) => {
    const size = sizes[band.item];
    if (!(size?.width > 0 && size?.height > 0)) return NOTICE_H;
    return Math.min(NOTICE_H, (noticeW * size.height) / size.width);
  };

  const weekBandCount = bands.filter((b) => b.kind === 'weeks').length;
  const noticeBudget = bands.reduce((t, b) => t + (b.kind === 'notice' ? noticeH(b) : 0), 0);
  const gaps = Math.max(0, bands.length - 1) * GAP;
  const available = Math.max(1, innerH - gaps - noticeBudget);
  const equalShare = weekBandCount ? available / weekBandCount : 0;

  // A week band is only as tall as its cards NEED to be at this column width.
  // Splitting the page into equal bands instead left a 2×2 page mostly white,
  // because a week card is much wider than it is tall and is therefore
  // width-constrained in a two-column cell.
  const naturalH = (band) => {
    const heights = band.items
      .map((i) => sizes[i])
      .filter((s) => s?.width > 0 && s?.height > 0)
      .map((s) => (cellW * s.height) / s.width);
    return heights.length ? Math.max(...heights) : equalShare;
  };

  const natural = bands.map((b) => (b.kind === 'notice' ? noticeH(b) : naturalH(b)));
  const isBlock = (b) => b.kind === 'weeks';
  const naturalWeekTotal = natural.reduce((t, h, i) => t + (isBlock(bands[i]) ? h : 0), 0);
  // Shrink proportionally when the cards want more room than the page has;
  // otherwise keep their natural size and centre the block vertically.
  const shrink = naturalWeekTotal > available ? available / naturalWeekTotal : 1;
  const bandH = natural.map((h, i) => (isBlock(bands[i]) ? h * shrink : h));
  const used = bandH.reduce((t, h) => t + h, 0) + gaps;

  const out = [];
  // PDF's y grows upwards, so walk from the top of the page downwards.
  let top = A4_PT.h - MARGIN - Math.max(0, (innerH - used) / 2);

  // Scale an image to fit its cell without distortion, centred. A week with no
  // captured image still reserves its cell, so one failed capture cannot shuffle
  // every later card into the wrong box.
  const fit = (kind, item, cellX, cellTop, cellW, cellH) => {
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
      fit('notice', band.item, MARGIN, top, noticeW, h);
    } else {
      band.items.forEach((weekIndex, i) => {
        fit('week', weekIndex, MARGIN + i * (cellW + GAP), top, cellW, h);
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
