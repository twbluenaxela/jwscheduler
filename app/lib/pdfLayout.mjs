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

export const MAX_BOXES = 4;
export const DEFAULT_LAYOUT = { rows: 2, cols: 1, count: 2 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Enforces 1 ≤ count ≤ rows*cols and rows*cols ≤ MAX_BOXES.
export function normalizeLayout(layout) {
  let rows = clamp(Math.round(layout?.rows ?? DEFAULT_LAYOUT.rows) || 1, 1, MAX_BOXES);
  let cols = clamp(Math.round(layout?.cols ?? DEFAULT_LAYOUT.cols) || 1, 1, MAX_BOXES);
  // Shrink the longer side until the grid holds at most MAX_BOXES.
  while (rows * cols > MAX_BOXES) {
    if (rows >= cols) rows -= 1; else cols -= 1;
  }
  const count = clamp(Math.round(layout?.count ?? rows * cols) || 1, 1, rows * cols);
  return { rows, cols, count };
}

// The ＋ button: one more week per page, growing the grid along whichever axis is
// already the long one so 2-stacked becomes 3-stacked rather than a 2×2 with a
// hole in it. Returns the same layout once MAX_BOXES is reached.
export function addBox(layout) {
  const { rows, cols, count } = normalizeLayout(layout);
  const next = count + 1;
  if (next > MAX_BOXES) return { rows, cols, count };
  if (next <= rows * cols) return { rows, cols, count: next };
  if (cols === 1) return normalizeLayout({ rows: next, cols: 1, count: next });
  if (rows === 1) return normalizeLayout({ rows: 1, cols: next, count: next });
  return normalizeLayout({ rows, cols, count: next });
}

// The − button. Never goes below a single box; shrinks the grid to match so the
// preview never shows a trailing empty row.
export function removeBox(layout) {
  const { rows, cols, count } = normalizeLayout(layout);
  const next = count - 1;
  if (next < 1) return { rows, cols, count };
  if (cols === 1) return normalizeLayout({ rows: next, cols: 1, count: next });
  if (rows === 1) return normalizeLayout({ rows: 1, cols: next, count: next });
  return normalizeLayout({ rows, cols, count: next });
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

  const weekBandCount = bands.filter((b) => b.kind === 'weeks').length;
  const noticeCount = bands.length - weekBandCount;
  const gaps = Math.max(0, bands.length - 1) * GAP;
  const available = Math.max(1, innerH - gaps - noticeCount * NOTICE_H);
  const equalShare = weekBandCount ? available / weekBandCount : 0;

  // A band is only as tall as the cards in it NEED to be at this column width.
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

  const natural = bands.map((b) => (b.kind === 'notice' ? NOTICE_H : naturalH(b)));
  const naturalWeekTotal = natural.reduce((t, h, i) => t + (bands[i].kind === 'weeks' ? h : 0), 0);
  // Shrink proportionally when the cards want more room than the page has;
  // otherwise keep their natural size and centre the block vertically.
  const shrink = naturalWeekTotal > available ? available / naturalWeekTotal : 1;
  const bandH = natural.map((h, i) => (bands[i].kind === 'weeks' ? h * shrink : h));
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
      fit('notice', band.item, MARGIN, top, innerW, h);
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
