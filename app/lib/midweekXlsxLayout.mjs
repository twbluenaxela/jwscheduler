// Print-layout arithmetic for the styled midweek workbook.
//
// WHY THIS IS A SEPARATE MODULE: midweekExport.js is 'use client', so Node can't
// load it. The pagination is exactly the part that broke (October printed two
// weeks plus half a week on page one), so the rows, the page packing AND the
// OOXML now live here, where `node --test` can pin them and
// scripts/check-xlsx-pagination.mjs can print the real workbook through a real
// spreadsheet renderer. midweekExport.js keeps only the download wrappers.
//
// THE BUG THIS REPLACES: the old builder emitted a manual page break after every
// second week and assumed that equalled one A4 page. Nothing checked the actual
// printed height. Every row carries an explicit `ht` with customHeight="1", so a
// week's height is fully determined by its content — and a pair of long weeks
// (more 用心準備傳道工作 parts, or a wrapped title) simply exceeds the page. With
// no `scale` in <pageSetup>, Excel's only recourse was an AUTOMATIC break inside
// the pair, stranding rows on a page of their own. Readers that drop
// <rowBreaks> on import (Google Sheets, some print paths) lost the spreads
// entirely and paginated from scratch.
//
// AND A SECOND CAUSE, found by printing the workbook through a real renderer
// (scripts/check-xlsx-pagination.mjs): the sheet was also too WIDE. <pageSetup>
// carried no fit setting, so at 100% the 指派 column fell off the right edge and
// every page grew a second, near-empty column-page — the user's "some remaining
// information on a third page". The 91-character column total only fits A4 when
// the workbook's Normal font really is Calibri; wherever Calibri is substituted
// (Linux, LibreOffice, many Macs) the same column widths come out ~28% wider.
//
// AND A THIRD CAUSE: MANY PRINT PATHS IGNORE <rowBreaks> ENTIRELY. Phone print
// dialogs and Google Sheets paginate automatically and drop the manual breaks.
//
// AND A FOURTH: THE USABLE PAGE HEIGHT IS NOT KNOWABLE. Padding each page to
// "A4 minus the margins we ask for" (791.5pt) still split a week on a phone,
// because the print dialog applied its own, larger margins — about 0.75in,
// leaving ~734pt, so a 752pt spread lost its last row. No assumed figure works.
//
// THE FIX, in three parts:
//   1. COLUMNS NARROW ENOUGH TO FIT A4. The old 91-character total only fitted
//      when the Normal font really was Calibri; substituted (Linux, Android,
//      many Macs) it overflowed and every page grew a second, near-empty
//      column-page. Measured against a real renderer, 76 units is the limit and
//      72 is what we use, so fitToWidth never has to shrink anything.
//   2. EVERY PAGE PADDED TO THE SAME HEIGHT (`pageHeightFor` + `padRows`),
//      including the last — trailing blank rows fall outside the used range, so
//      the final page's filler carries a cell to anchor it.
//   3. `fitToWidth="1" fitToHeight="<pageCount>"`. The renderer then picks
//      scale = itsUsableHeight / pageHeight, so one page holds exactly one
//      spread whatever its margins are. This is scale-invariant: verified by
//      rendering at 0.35in, 0.6in, 0.85in and 1.0in margins, with the manual
//      breaks present AND stripped — 16 combinations, all correct.
//
// Manual <rowBreaks> are still emitted: Excel honours them, and they agree with
// the fit-to-height boundaries rather than fighting them.

import { isMidweekSuspended, suspendedNotice } from './weekType.mjs';
import { cellRef, escapeXml, zipXlsx } from './xlsx.mjs';

// A4 portrait, minus the 0.35in top/bottom margins the sheet sets. Points.
export const A4_HEIGHT_PT = 841.89;
export const PAGE_MARGIN_IN = 0.35;
export const A4_PRINTABLE_PT = A4_HEIGHT_PT - 2 * PAGE_MARGIN_IN * 72; // ≈791.4

// Width (in `textUnits`) of the 項目 column — MW_XLSX_COLS[2] is 36, and a CJK
// glyph is two units, so ~17 characters per line.
export const TITLE_COL_UNITS = 34;

export const ROW_HT = {
  head: 26,
  item: 17,
  band: 18,
  part: 17,
  spacer: 14,
  notice: 22,
};

// Approximate printed width: CJK glyphs count double.
export function textUnits(text) {
  let units = 0;
  for (const ch of String(text ?? '')) {
    units += /[⺀-鿿豈-﫿＀-￦]/.test(ch) ? 2 : 1;
  }
  return units;
}

// How many wrapped lines a part title needs.
//
// The old rule was binary — `textUnits > 44 → ht: 30` — which assumed every long
// title is exactly two lines. A three-line title (a long 生活 part, or a CBS row
// carrying its cbsRef) was both CLIPPED on the page and UNDER-COUNTED in the
// height budget, which is how a spread could overflow without anything noticing.
export function titleLineCount(title) {
  const units = textUnits(title);
  if (units <= TITLE_COL_UNITS) return 1;
  return Math.ceil(units / TITLE_COL_UNITS);
}

export function partTitleText(part) {
  let title = `${part?.title ?? ''}（${part?.dur ?? ''}）`;
  if (part?.cbsRef) title += ` ${part.cbsRef}`;
  return title;
}

// Single-line rows keep the compact 17pt; wrapped rows get 15pt per line plus a
// little padding, so the text actually fits the box we reserve for it.
export function partRowHeight(part) {
  const lines = titleLineCount(partTitleText(part));
  return lines <= 1 ? ROW_HT.part : 15 * lines + 4;
}

export function sumHeights(rows) {
  return (rows ?? []).reduce((total, row) => total + (row?.ht ?? 0), 0);
}

/* ===================== Page packing ===================== */

// Greedy, in order. `perPage` counts only weeks that actually have a meeting:
// a cancelled week contributes its (short) notice block to the page height but
// does NOT consume one of the two slots, so the real weeks still pair up —
// otherwise a single 大會 week would knock every following spread out of phase.
//
// TWO MEANS TWO: a page always carries `perPage` scheduled weeks. An earlier
// version dropped to one week when a pair could not fit at the row-height floor,
// which is not what "two weeks per page" means — the answer to a tall pair is to
// let the fit-to-height scale shrink the sheet, not to reprint the month at one
// week a sheet. Height therefore plays no part in packing.
//
// Returns [{ indexes: number[], scheduled: number }] over the input array.
export function paginateWeeks(weeks, { perPage = 2, isSuspended = () => false } = {}) {
  const list = weeks ?? [];
  const pages = [];
  let page = null;

  const open = () => { page = { indexes: [], scheduled: 0 }; pages.push(page); };

  list.forEach((week, index) => {
    if (!page) open();
    const suspended = isSuspended(week);
    // Never open a page just for a cancelled week: its notice is two rows, and
    // stranding it alone would waste a whole sheet of paper.
    if (!suspended && page.scheduled >= perPage) open();
    page.indexes.push(index);
    if (!suspended) page.scheduled += 1;
  });

  // A page holding only notices at the very end is legitimate; an empty one is not.
  return pages.filter((p) => p.indexes.length > 0);
}

// Every page is padded to the SAME total height, and <pageSetup> then asks the
// renderer to fit exactly that many pages. The renderer therefore picks
// scale = itsUsableHeight / PAGE_H, and one page holds exactly PAGE_H row-points
// — one spread — WITHOUT us ever knowing what its usable height is.
//
// That last part is the whole point. Earlier versions padded to a page height we
// assumed (A4 minus the 0.35in margins the file asks for, 791.5pt). A phone's
// print dialog applies its own, larger margins — measured at roughly 0.75in,
// leaving ~734pt — so a 752pt spread lost its final row to the next page. There
// is no margin figure we can assume; this scheme removes the assumption.
//
// PAGE_H is the tallest spread, floored at the nominal A4 printable height so a
// short month is never blown up past 100%.
export function pageHeightFor(pageHeights) {
  return Math.max(A4_PRINTABLE_PT, ...(pageHeights ?? [0]));
}

// Excel's hard cap on a single row.
export const MAX_ROW_PT = 409;

// Filler row heights that bring a page up to exactly `target`.
//
// The final filler carries a cell (a single space) because TRAILING BLANK ROWS
// ARE NOT PART OF A SHEET'S USED RANGE: without it the last page's padding is
// discarded, the sheet is shorter than pageCount × PAGE_H, and the fit-to-height
// scale comes out too large — every page then takes more than one spread. Proven
// by rendering: unanchored, the 5-week case split at every margin setting.
export function padRows(pageHeight, target) {
  let remaining = Math.round((target - pageHeight) * 100) / 100;
  if (!(remaining > 0)) return [];
  const out = [];
  while (remaining > 0) {
    const ht = Math.min(MAX_ROW_PT, remaining);
    remaining = Math.round((remaining - ht) * 100) / 100;
    out.push({ ht: Math.round(ht * 100) / 100, anchor: remaining <= 0 });
  }
  return out;
}

/* ===================== Cell styles and colours ===================== */

export const XLC = {
  ink: 'FF211F1C',
  ink2: 'FF57534D',
  ink3: 'FF8C877F',
  line: 'FFD9D6CF',
  headFill: 'FFF2F1ED',
  softFill: 'FFF8F7F4',
  special: 'FFC23123',
  treasures: 'FF6F6F6F',
  ministry: 'FFB58A08',
  living: 'FF8C2B22',
};

// cellXfs indexes produced by buildMidweekStylesXml in midweekExport.js.
export const S = {
  time: 1, num: 2, title: 3, titleWrap: 4, role: 5, name: 6, item: 7,
  bandT: 8, bandM: 9, bandL: 10, head: 11, headPad: 12,
  numT: 13, numM: 14, numL: 15,
  songTime: 16, songNum: 17, songItem: 18, songRole: 19, songName: 20,
  notice: 21,
};

/* ===================== Row building ===================== */

// One week → styled sheet rows ({ ht, merge, cells: [{v, s}] } per row), in the
// same order as the on-screen card. Pure, so the page packer below measures the
// REAL rows rather than a parallel estimate that could drift from them.
export function weekRows(week, getAssign, { isSuspended = () => false } = {}) {
  const wid = `mw${week.id}`;
  const get = (slot, fb) => (typeof getAssign === 'function' ? getAssign(slot, fb) : fb) || '';

  // Rich-text header mirrors the card's mw-head: big date, red weekday pill
  // text, gold special-week label, grey reading line with the scripture bold.
  const run = (text, { sz = 11, color = XLC.ink, bold = false } = {}) => ({ text, sz, color, bold });
  const headRuns = [run(week.date ?? '', { sz: 14, bold: true })];
  if (week.weekdayPill) headRuns.push(run(`　${week.weekdayPill}`, { color: XLC.special, bold: true }));
  if (week.label) headRuns.push(run(`　${week.label}`, { color: XLC.ministry, bold: true }));

  const headRow = (runs) => ({
    ht: ROW_HT.head,
    merge: true,
    cells: [
      { rich: runs, s: S.head },
      { v: '', s: S.headPad }, { v: '', s: S.headPad }, { v: '', s: S.headPad }, { v: '', s: S.headPad },
    ],
  });

  // A cancelled week collapses to header + notice. Two rows instead of ~20, and
  // no getAssign lookups — a stale name must never print on a cancelled week.
  if (isSuspended(week)) {
    return [
      headRow(headRuns),
      {
        ht: ROW_HT.notice,
        merge: true,
        cells: [
          { v: suspendedNotice(week), s: S.notice },
          { v: '', s: S.notice }, { v: '', s: S.notice }, { v: '', s: S.notice }, { v: '', s: S.notice },
        ],
      },
    ];
  }

  if (week.reading) {
    headRuns.push(run('　·　每週閱讀經文：', { sz: 10.5, color: XLC.ink3 }));
    headRuns.push(run(week.reading, { sz: 10.5, color: XLC.ink2, bold: true }));
  }

  // `soft` = fixed program rows (唱詩/開場白/結語) — light tint for rhythm
  const itemRow = (time, label, role, name, soft = false) => ({
    ht: ROW_HT.item,
    cells: [
      { v: time || '', s: soft ? S.songTime : S.time },
      { v: '', s: soft ? S.songNum : S.num },
      { v: label, s: soft ? S.songItem : S.item },
      { v: role || '', s: soft ? S.songRole : S.role },
      { v: name || '', s: soft ? S.songName : S.name },
    ],
  });
  const band = (label, s) => ({
    ht: ROW_HT.band,
    merge: true,
    cells: [{ v: label, s }, { v: '', s }, { v: '', s }, { v: '', s }, { v: '', s }],
  });
  const partRow = (part, numS = S.num) => {
    // Mirror the UI's pair rule: helper slot only exists for '/' roleLabels
    // (and can be hidden per-part), so phantom _1 assignments never leak in.
    const isPair = part.roleLabel?.includes('/') && !part.hideHelper;
    const names = [
      get(`${wid}_${part.id}_0`, part.assign?.[0] ?? ''),
      isPair ? get(`${wid}_${part.id}_1`, part.assign?.[1] ?? '') : '',
    ].filter(Boolean).join(' / ');
    const title = partTitleText(part);
    const wrapped = titleLineCount(title) > 1;
    return {
      ht: partRowHeight(part),
      cells: [
        { v: part.time || '', s: S.time },
        { v: part.partNum ?? '', s: numS },
        { v: title, s: wrapped ? S.titleWrap : S.title },
        { v: part.roleLabel || '', s: S.role },
        { v: names, s: S.name },
      ],
    };
  };

  return [
    headRow(headRuns),
    itemRow('', '主席', '', get(`${wid}_chairman`, week.chairman)),
    itemRow('', '開始禱告', '', get(`${wid}_openPrayer`, week.openPrayer)),
    itemRow(week.openSongTime, `唱詩 ${week.openSong ?? ''} 首・開場白（1 分鐘）`, '', '', true),
    band('上帝話語的寶藏', S.bandT),
    ...(week.treasures ?? []).map((p) => partRow(p, S.numT)),
    band('用心準備傳道工作', S.bandM),
    ...(week.ministry ?? []).map((p) => partRow(p, S.numM)),
    band('基督徒的生活', S.bandL),
    itemRow(week.midSongTime, `唱詩 ${week.midSong ?? ''} 首`, '', '', true),
    ...(week.living ?? []).map((p) => partRow(p, S.numL)),
    itemRow(week.closingTime, `結語（${week.closingDur || ''}）`, '', '', true),
    itemRow(week.closeSongTime, `唱詩 ${week.closeSong ?? ''} 首`, '結束禱告', get(`${wid}_closePrayer`, week.closePrayer), true),
  ];
}

/* ===================== The whole sheet ===================== */

// Builds the complete row list and the manual break positions for a set of
// weeks. Pure and fully testable — buildMidweekXlsxBlob only turns the result
// into XML.
export function buildSheetPlan(weeks, getAssign, { perPage = 2, isSuspended = () => false } = {}) {
  const opts = { isSuspended };
  const pages = paginateWeeks(weeks, { perPage, isSuspended });

  // Measure every page before emitting anything: they all have to end up the
  // same height, which is the tallest one.
  const pageBlocks = pages.map((page) => page.indexes.map((i) => weekRows(weeks[i], getAssign, opts)));
  const rawHeights = pageBlocks.map((blocks) => (
    blocks.reduce((total, rows) => total + sumHeights(rows), 0)
    + Math.max(0, blocks.length - 1) * ROW_HT.spacer
  ));
  const pageHeight = pageHeightFor(rawHeights);

  const rows = [];
  const breaks = [];
  pageBlocks.forEach((blocks, pageIndex) => {
    if (pageIndex > 0) breaks.push(rows.length);
    blocks.forEach((block, blockIndex) => {
      if (blockIndex > 0) rows.push({ ht: ROW_HT.spacer, cells: [] });
      rows.push(...block);
    });
    // EVERY page, the last one included — equal page heights are what make the
    // fit-to-height scale land one spread per page.
    padRows(rawHeights[pageIndex], pageHeight).forEach(({ ht, anchor }) => {
      rows.push({ ht, cells: anchor ? [{ v: ' ', s: 0 }] : [] });
    });
  });

  return {
    rows, breaks, pages, rawHeights, pageHeight, pageCount: pageBlocks.length,
  };
}

/* ===================== OOXML writing ===================== */

// 時間 / 編號 / 項目 / 角色 / 指派, in Excel character units. The total (72) is
// what lets the sheet print one page wide at 100% even where Calibri is
// substituted by a wider font — measured, not guessed: 76 is the limit in a real
// renderer and 80 already spills. Do not widen these without re-running
// scripts/check-xlsx-pagination.mjs.
const MW_XLSX_COLS = [6, 3, 36, 9, 18];

export function buildMidweekStylesXml() {
  const font = (sz, color, bold, italic = false) =>
    `<font>${bold ? '<b/>' : ''}${italic ? '<i/>' : ''}<sz val="${sz}"/><color rgb="${color}"/><name val="Microsoft JhengHei"/></font>`;
  const solidFill = (rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/></patternFill></fill>`;
  const xf = (fontId, fillId, borderId, h, wrap = false) =>
    `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">`
    + `<alignment horizontal="${h}" vertical="center"${wrap ? ' wrapText="1"' : ''}/></xf>`;

  const fonts = [
    // 0 = the workbook "Normal" font — METRIC ONLY, no visible cell uses it.
    // Excel sizes column widths in units of this font's digit width; a CJK
    // default (≈11px/unit vs Calibri's 7) inflates the sheet ~1.5× and pushes
    // the names column onto its own printed page. Keep this Calibri.
    `<font><sz val="11"/><color rgb="${XLC.ink}"/><name val="Calibri"/></font>`,
    font(11, XLC.ink, true),         // 1 names
    font(12, 'FFFFFFFF', true),      // 2 band titles
    font(14, XLC.ink, true),         // 3 week header
    font(10, XLC.ink3, false),       // 4 time / part number
    font(11, XLC.ink2, true),        // 5 fixed items (主席、唱詩…)
    font(10, XLC.treasures, true),   // 6 part no. 寶藏 (echoes the UI dot)
    font(10, XLC.ministry, true),    // 7 part no. 傳道
    font(10, XLC.living, true),      // 8 part no. 生活
    font(10, XLC.ink3, false, true), // 9 role labels (italic)
    font(11, XLC.ink, false),        // 10 body (part titles)
    font(11, XLC.special, true),     // 11 「本週聚會暫停」 notice
  ];
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    solidFill(XLC.headFill),   // 2
    solidFill(XLC.treasures),  // 3
    solidFill(XLC.ministry),   // 4
    solidFill(XLC.living),     // 5
    solidFill(XLC.softFill),   // 6 fixed program rows (唱詩/結語)
    solidFill('FFFBEAE7'),     // 7 cancelled-week notice band (soft red)
  ];
  const borders = [
    '<border/>',
    `<border><bottom style="thin"><color rgb="${XLC.line}"/></bottom></border>`, // 1 row divider
  ];
  const xfs = [
    xf(0, 0, 0, 'left'),          // 0 default / spacer
    xf(4, 0, 1, 'left'),          // 1 time
    xf(4, 0, 1, 'center'),        // 2 part number (plain)
    xf(10, 0, 1, 'left'),         // 3 part title
    xf(10, 0, 1, 'left', true),   // 4 part title (long → wrapped)
    xf(9, 0, 1, 'right'),         // 5 role label
    xf(1, 0, 1, 'left'),          // 6 assignee name
    xf(5, 0, 1, 'left'),          // 7 fixed item label
    xf(2, 3, 0, 'left'),          // 8 band 寶藏
    xf(2, 4, 0, 'left'),          // 9 band 傳道
    xf(2, 5, 0, 'left'),          // 10 band 生活
    xf(3, 2, 1, 'left'),          // 11 week header
    xf(0, 2, 1, 'left'),          // 12 week header padding cells
    xf(6, 0, 1, 'center'),        // 13 part number 寶藏
    xf(7, 0, 1, 'center'),        // 14 part number 傳道
    xf(8, 0, 1, 'center'),        // 15 part number 生活
    xf(4, 6, 1, 'left'),          // 16 song-row time
    xf(4, 6, 1, 'center'),        // 17 song-row number col
    xf(5, 6, 1, 'left'),          // 18 song-row item
    xf(9, 6, 1, 'right'),         // 19 song-row role
    xf(1, 6, 1, 'left'),          // 20 song-row name
    xf(11, 7, 1, 'center'),       // 21 cancelled-week notice
  ];

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + `<fonts count="${fonts.length}">${fonts.join('')}</fonts>`
    + `<fills count="${fills.length}">${fills.join('')}</fills>`
    + `<borders count="${borders.length}">${borders.join('')}</borders>`
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>`
    + '</styleSheet>';
}

export function buildStyledSheetXml(rows, breaks, pageCount = 1, marginIn = PAGE_MARGIN_IN) {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ';
  xml += 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
  // The child order below is fixed by the OOXML schema: sheetPr, sheetViews,
  // sheetFormatPr, cols, sheetData, mergeCells, printOptions, pageMargins,
  // pageSetup, rowBreaks. Reordering makes Excel reject the file.
  //
  // fitToPage is ON: it is what makes the layout independent of the renderer's
  // real page height. See this file's header.
  xml += '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>';
  xml += '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews>';
  xml += '<sheetFormatPr defaultRowHeight="17"/>';
  xml += '<cols>';
  MW_XLSX_COLS.forEach((width, idx) => {
    xml += `<col min="${idx + 1}" max="${idx + 1}" width="${width}" customWidth="1"/>`;
  });
  xml += '</cols><sheetData>';

  const merges = [];
  rows.forEach((row, i) => {
    const r = i + 1;
    xml += `<row r="${r}" ht="${row.ht}" customHeight="1">`;
    row.cells.forEach((cell, c) => {
      const ref = cellRef(c + 1, r);
      if (cell.rich) {
        const runs = cell.rich.map((rn) =>
          `<r><rPr>${rn.bold ? '<b/>' : ''}<sz val="${rn.sz}"/><color rgb="${rn.color}"/><rFont val="Microsoft JhengHei"/></rPr>`
          + `<t xml:space="preserve">${escapeXml(rn.text)}</t></r>`).join('');
        xml += `<c r="${ref}" s="${cell.s}" t="inlineStr"><is>${runs}</is></c>`;
      } else if (cell.v === '' || cell.v === null || cell.v === undefined) {
        xml += `<c r="${ref}" s="${cell.s}"/>`;
      } else {
        xml += `<c r="${ref}" s="${cell.s}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.v)}</t></is></c>`;
      }
    });
    xml += '</row>';
    if (row.merge) merges.push(`A${r}:E${r}`);
  });

  xml += '</sheetData>';
  if (merges.length) {
    xml += `<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
  }
  xml += '<printOptions horizontalCentered="1"/>';
  // marginIn is a parameter only so the renderer check can emulate a print path
  // that overrides our margins; the app always ships PAGE_MARGIN_IN.
  xml += `<pageMargins left="0.3" right="0.3" top="${marginIn}" bottom="${marginIn}" header="0.2" footer="0.2"/>`;
  // paperSize 9 = A4. fitToHeight is the page COUNT, not a scale: every page holds
  // the same row-height total, so the renderer's own scale puts exactly one
  // spread on each. fitToWidth="1" never binds — the columns already fit.
  xml += `<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="${Math.max(1, pageCount)}"/>`;
  if (breaks.length) {
    xml += `<rowBreaks count="${breaks.length}" manualBreakCount="${breaks.length}">`;
    breaks.forEach((b) => { xml += `<brk id="${b}" max="16383" man="1"/>`; });
    xml += '</rowBreaks>';
  }
  xml += '</worksheet>';
  return xml;
}

// The complete styled workbook, ready to download. Lives here rather than in
// midweekExport.js so the pagination it depends on can be checked against a real
// spreadsheet renderer (scripts/check-xlsx-pagination.mjs) outside the browser.
export function buildMidweekXlsxBlob(weeks, getAssign) {
  const { rows, breaks, pageCount } = buildSheetPlan(weeks, getAssign, {
    perPage: 2,
    isSuspended: isMidweekSuspended,
  });
  return zipXlsx(buildStyledSheetXml(rows, breaks, pageCount), buildMidweekStylesXml());
}
