'use client';

import JSZip from 'jszip';

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function sanitizeFilename(value) {
  return String(value ?? 'midweek')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

function getWeekLabel(week) {
  return week?.dateLabel || week?.date || '週中';
}

/* ===================== Styled midweek XLSX (bulletin-board print) =====================
   The workbook mirrors the on-screen card: section bands in the section colours,
   grey time/role columns, bold names. Page setup is A4 portrait with a manual page
   break after every second week, so printing straight from Excel puts exactly two
   weeks on each page. */

const MW_XLSX_COLS = [7, 4, 46, 12, 22]; // 時間 / 編號 / 項目 / 角色 / 指派

const XLC = {
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

// cellXfs indexes produced by buildMidweekStylesXml
const S = {
  time: 1, num: 2, title: 3, titleWrap: 4, role: 5, name: 6, item: 7,
  bandT: 8, bandM: 9, bandL: 10, head: 11, headPad: 12,
  numT: 13, numM: 14, numL: 15,
  songTime: 16, songNum: 17, songItem: 18, songRole: 19, songName: 20,
};

function buildMidweekStylesXml() {
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
  ];
  const fills = [
    '<fill><patternFill patternType="none"/></fill>',
    '<fill><patternFill patternType="gray125"/></fill>',
    solidFill(XLC.headFill),   // 2
    solidFill(XLC.treasures),  // 3
    solidFill(XLC.ministry),   // 4
    solidFill(XLC.living),     // 5
    solidFill(XLC.softFill),   // 6 fixed program rows (唱詩/結語)
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

// Approximate printed width: CJK glyphs count double. Used to decide when a
// part title needs a wrapped (taller) row instead of a single line.
function textUnits(text) {
  let units = 0;
  for (const ch of String(text ?? '')) {
    units += /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffe6]/.test(ch) ? 2 : 1;
  }
  return units;
}

// One week → styled sheet rows ({ ht, merge, cells: [{v, s}] } per row),
// in the same order as the on-screen card.
function weekRows(week, getAssign) {
  const wid = `mw${week.id}`;
  const get = (slot, fb) => (typeof getAssign === 'function' ? getAssign(slot, fb) : fb) || '';

  // `soft` = fixed program rows (唱詩/開場白/結語) — light tint for rhythm
  const itemRow = (time, label, role, name, soft = false) => ({
    ht: 17,
    cells: [
      { v: time || '', s: soft ? S.songTime : S.time },
      { v: '', s: soft ? S.songNum : S.num },
      { v: label, s: soft ? S.songItem : S.item },
      { v: role || '', s: soft ? S.songRole : S.role },
      { v: name || '', s: soft ? S.songName : S.name },
    ],
  });
  const band = (label, s) => ({ ht: 18, merge: true, cells: [{ v: label, s }, { v: '', s }, { v: '', s }, { v: '', s }, { v: '', s }] });
  const partRow = (part, numS = S.num) => {
    // Mirror the UI's pair rule: helper slot only exists for '/' roleLabels
    // (and can be hidden per-part), so phantom _1 assignments never leak in.
    const isPair = part.roleLabel?.includes('/') && !part.hideHelper;
    const names = [
      get(`${wid}_${part.id}_0`, part.assign?.[0] ?? ''),
      isPair ? get(`${wid}_${part.id}_1`, part.assign?.[1] ?? '') : '',
    ].filter(Boolean).join(' / ');
    let title = `${part.title}（${part.dur}）`;
    if (part.cbsRef) title += ` ${part.cbsRef}`;
    const long = textUnits(title) > 44;
    return {
      ht: long ? 30 : 17,
      cells: [
        { v: part.time || '', s: S.time },
        { v: part.partNum ?? '', s: numS },
        { v: title, s: long ? S.titleWrap : S.title },
        { v: part.roleLabel || '', s: S.role },
        { v: names, s: S.name },
      ],
    };
  };

  // Rich-text header mirrors the card's mw-head: big date, red weekday pill
  // text, gold special-week label, grey reading line with the scripture bold.
  const run = (text, { sz = 11, color = XLC.ink, bold = false } = {}) => ({ text, sz, color, bold });
  const headRuns = [run(week.date ?? '', { sz: 14, bold: true })];
  if (week.weekdayPill) headRuns.push(run(`　${week.weekdayPill}`, { color: XLC.special, bold: true }));
  if (week.label) headRuns.push(run(`　${week.label}`, { color: XLC.ministry, bold: true }));
  if (week.reading) {
    headRuns.push(run('　·　每週閱讀經文：', { sz: 10.5, color: XLC.ink3 }));
    headRuns.push(run(week.reading, { sz: 10.5, color: XLC.ink2, bold: true }));
  }

  return [
    { ht: 26, merge: true, cells: [{ rich: headRuns, s: S.head }, { v: '', s: S.headPad }, { v: '', s: S.headPad }, { v: '', s: S.headPad }, { v: '', s: S.headPad }] },
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

function buildStyledSheetXml(rows, breaks) {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ';
  xml += 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
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
  xml += '<pageMargins left="0.3" right="0.3" top="0.35" bottom="0.35" header="0.2" footer="0.2"/>';
  xml += '<pageSetup paperSize="9" orientation="portrait"/>'; // paperSize 9 = A4
  if (breaks.length) {
    xml += `<rowBreaks count="${breaks.length}" manualBreakCount="${breaks.length}">`;
    breaks.forEach((b) => { xml += `<brk id="${b}" max="16383" man="1"/>`; });
    xml += '</rowBreaks>';
  }
  xml += '</worksheet>';
  return xml;
}

export function buildMidweekXlsxBlob(weeks, getAssign) {
  const rows = [];
  const breaks = [];
  weeks.forEach((week, i) => {
    if (i > 0 && i % 2 === 0) {
      breaks.push(rows.length); // page break after every second week
    } else if (i > 0) {
      rows.push({ ht: 14, cells: [] }); // spacer between the two weeks on a page
    }
    rows.push(...weekRows(week, getAssign));
  });
  return zipXlsx(buildStyledSheetXml(rows, breaks), buildMidweekStylesXml());
}

function cellRef(colIndex, rowIndex) {
  let n = colIndex;
  let letters = '';
  while (n > 0) {
    const mod = (n - 1) % 26;
    letters = String.fromCharCode(65 + mod) + letters;
    n = Math.floor((n - mod) / 26);
  }
  return `${letters}${rowIndex}`;
}

/* ===================== Plain XLSX (used by the weekend export) ===================== */

function buildPlainSheetXml(rows, cols = [18, 18, 48, 36, 22, 18]) {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ';
  xml += 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
  xml += '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  xml += '<sheetFormatPr defaultRowHeight="20"/>';
  xml += '<cols>';
  cols.forEach((width, idx) => {
    xml += `<col min="${idx + 1}" max="${idx + 1}" width="${width}" customWidth="1"/>`;
  });
  xml += '</cols>';
  xml += '<sheetData>';

  rows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    xml += `<row r="${rowNumber}">`;
    row.forEach((cell, colIndex) => {
      if (cell === '' || cell === null || cell === undefined) return;
      const ref = cellRef(colIndex + 1, rowNumber);
      xml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell)}</t></is></c>`;
    });
    xml += '</row>';
  });

  xml += '</sheetData></worksheet>';
  return xml;
}

function zipXlsx(sheetXml, stylesXml, sheetName = '週中') {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('xl/styles.xml', stylesXml);
  zip.file('xl/worksheets/sheet1.xml', sheetXml);
  // Tag the blob with the real spreadsheet MIME type. Without it the download
  // carries no content-type and mobile file handlers open it as a raw zip of
  // XML parts instead of in a spreadsheet app.
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

const PLAIN_STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`;

export function buildXlsxBuffer(rows, { sheetName = '週中', cols } = {}) {
  return zipXlsx(buildPlainSheetXml(rows, cols), PLAIN_STYLES_XML, sheetName);
}

export function getMidweekExportFilename(week, ext) {
  return `${sanitizeFilename(getWeekLabel(week)) || 'midweek'}.${ext}`;
}

export async function downloadWeekXlsx(week, getAssign) {
  const blob = await buildMidweekXlsxBlob([week], getAssign);
  triggerDownload(blob, getMidweekExportFilename(week, 'xlsx'));
}

export async function exportWeeksXlsx(weeks, getAssign) {
  if (!weeks.length) return;
  const blob = await buildMidweekXlsxBlob(weeks, getAssign);
  triggerDownload(blob, weeks.length === 1 ? getMidweekExportFilename(weeks[0], 'xlsx') : `週中_${weeks.length}週.xlsx`);
}

/* ===================== Shared download / PDF helpers ===================== */

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function dataUrlToUint8(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Reads a JPEG data URL into { bytes, width, height } (used for DOM screenshots
// where we don't already have the source canvas dimensions).
export async function jpegDataUrlToImage(dataUrl) {
  const bytes = dataUrlToUint8(dataUrl);
  const dims = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('無法讀取圖片尺寸。'));
    img.src = dataUrl;
  });
  return { bytes, width: dims.width, height: dims.height };
}

// Builds a multi-page PDF (one baseline-JPEG image per page) entirely in the
// browser — no print dialog, no external library. Each page is sized to match
// its image's aspect ratio (A4 width, height scaled to fit) so the card fills
// the whole page edge-to-edge with no white margins — the PDF looks exactly
// like the exported card image.
export function jpegImagesToPdfBlob(images) {
  const PAGE_W = 595.28; // A4 width in points; page height follows each image
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const offsets = [];

  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    offset += bytes.length;
  };
  const startObj = (n) => { offsets[n] = offset; push(`${n} 0 obj\n`); };

  push('%PDF-1.4\n');
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const numImages = images.length;
  const pageObjNums = images.map((_, i) => 3 + i * 3);
  const totalObjs = 2 + numImages * 3;

  startObj(1);
  push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  push(`<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${numImages} >>\nendobj\n`);

  images.forEach((img, i) => {
    const pageNum = 3 + i * 3;
    const contentNum = 4 + i * 3;
    const imageNum = 5 + i * 3;
    const pageW = PAGE_W;
    const pageH = PAGE_W * (img.height / img.width);

    startObj(pageNum);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`);

    // Fill the entire page with the image (no margins).
    const content = `q ${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm /Im0 Do Q`;
    startObj(contentNum);
    push(`<< /Length ${enc.encode(content).length} >>\nstream\n`);
    push(content);
    push('\nendstream\nendobj\n');

    startObj(imageNum);
    push(`<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
    push(img.bytes);
    push('\nendstream\nendobj\n');
  });

  const xrefOffset = offset;
  const objCount = totalObjs + 1;
  push(`xref\n0 ${objCount}\n`);
  push('0000000000 65535 f \n');
  for (let n = 1; n <= totalObjs; n += 1) {
    push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return new Blob([out], { type: 'application/pdf' });
}

/* ===================== Plain-text export ===================== */

// Plain-text version of a week's schedule, suitable for pasting into a LINE group.
export function buildWeekText(week, getAssign) {
  if (!week) return '';
  const wId = `mw${week.id}`;
  const get = (slot, fb) => (typeof getAssign === 'function' ? getAssign(slot, fb) : fb) || '';
  const lines = [];
  lines.push(`📋 週中 — ${getWeekLabel(week)}`);
  if (week.weekdayPill) lines.push(week.weekdayPill);
  if (week.reading) lines.push(`每週閱讀經文：${week.reading}`);
  lines.push('');

  const chairman = get(`${wId}_chairman`, week.chairman);
  const openPrayer = get(`${wId}_openPrayer`, week.openPrayer);
  if (chairman) lines.push(`主席：${chairman}`);
  if (openPrayer) lines.push(`開始禱告：${openPrayer}`);
  lines.push('');

  const section = (title, parts) => {
    if (!parts?.length) return;
    lines.push(`【${title}】`);
    parts.forEach((part) => {
      const names = part.assign
        .map((_, i) => get(`${wId}_${part.id}_${i}`, part.assign[i] ?? ''))
        .filter(Boolean);
      lines.push(`${part.partNum}. ${part.title}：${names.length ? names.join(' / ') : '—'}`);
    });
    lines.push('');
  };
  section('上帝話語的寶藏', week.treasures);
  section('用心準備傳道工作', week.ministry);
  section('基督徒的生活', week.living);

  const closePrayer = get(`${wId}_closePrayer`, week.closePrayer);
  if (closePrayer) lines.push(`結束禱告：${closePrayer}`);

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* ===== DOM-node exporters (screenshot the real card so the output matches it exactly) =====
   These capture an actual rendered MidweekWeek card via html-to-image — identical to the
   meetings-page export. The caller passes the rendered card DOM nodes (one per week, in the
   same order as `weeks`). */

async function nodeToJpegDataUrl(node) {
  const { toJpeg } = await import('html-to-image');
  return toJpeg(node, { pixelRatio: 2, quality: 0.95, backgroundColor: '#ecebe7', skipFonts: false });
}

export async function exportNodesJpeg(nodes, weeks) {
  if (!nodes.length) return;
  if (nodes.length === 1) {
    const dataUrl = await nodeToJpegDataUrl(nodes[0]);
    const blob = await (await fetch(dataUrl)).blob();
    triggerDownload(blob, getMidweekExportFilename(weeks[0], 'jpg'));
    return;
  }
  const zip = new JSZip();
  for (let i = 0; i < nodes.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const dataUrl = await nodeToJpegDataUrl(nodes[i]);
    // eslint-disable-next-line no-await-in-loop
    const blob = await (await fetch(dataUrl)).blob();
    zip.file(`${sanitizeFilename(getWeekLabel(weeks[i]))}.jpg`, blob);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  triggerDownload(out, `週中_${nodes.length}週.zip`);
}

export async function exportNodesPdf(nodes, weeks) {
  if (!nodes.length) return;
  const images = [];
  for (const node of nodes) {
    // eslint-disable-next-line no-await-in-loop
    images.push(await jpegDataUrlToImage(await nodeToJpegDataUrl(node)));
  }
  const blob = jpegImagesToPdfBlob(images);
  triggerDownload(blob, nodes.length === 1 ? getMidweekExportFilename(weeks[0], 'pdf') : `週中_${nodes.length}週.pdf`);
}

export async function openNodesPrintWindow(nodes) {
  if (!nodes.length) throw new Error('沒有可列印的週次。');
  const urls = [];
  for (const node of nodes) {
    // eslint-disable-next-line no-await-in-loop
    urls.push(await nodeToJpegDataUrl(node));
  }
  const imgs = urls.map((u) => `<img src="${u}" />`).join('');
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=900');
  if (!popup) throw new Error('瀏覽器阻擋了列印視窗。');
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>週中</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #ecebe7; }
      img { display: block; width: 100%; height: auto; page-break-after: always; }
      @media print { body { background: #fff; } }
    </style></head><body>${imgs}
    <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));<\/script>
    </body></html>`);
  popup.document.close();
  popup.focus();
  return popup;
}
