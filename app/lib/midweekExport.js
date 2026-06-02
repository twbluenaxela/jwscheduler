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

function getAssignName(week, getAssign, slotId, fallback = '') {
  if (!week || typeof getAssign !== 'function') return fallback || '';
  return getAssign(slotId, fallback) || '';
}

function getRowDefinitions(week, getAssign) {
  if (!week) return [];

  const weekId = `mw${week.id}`;
  const joinAssign = (names) => names.filter(Boolean).join(' / ');

  const rows = [
    { time: week.weekdayPill, section: '週次資訊', item: '星期與時間', meta: week.reading, assign: '' },
    { time: week.openSongTime, section: '上帝話語的寶藏', item: `唱詩 ${week.openSong} 首`, meta: '開場', assign: '' },
    { time: week.openIntroTime, section: '上帝話語的寶藏', item: '開場白', meta: '1 分鐘', assign: '' },
    {
      time: '',
      section: '會眾項目',
      item: '主席',
      meta: '',
      assign: getAssignName(week, getAssign, `${weekId}_chairman`, week.chairman),
    },
    {
      time: '',
      section: '會眾項目',
      item: '開始禱告',
      meta: '',
      assign: getAssignName(week, getAssign, `${weekId}_openPrayer`, week.openPrayer),
    },
  ];

  week.treasures.forEach((part) => {
    const names = part.assign.map((_, index) => getAssignName(week, getAssign, `${weekId}_${part.id}_${index}`, part.assign[index] ?? ''));
    rows.push({
      time: part.time,
      section: '上帝話語的寶藏',
      item: `${part.partNum}. ${part.title}`,
      meta: `${part.dur}${part.roleLabel ? ` · ${part.roleLabel}` : ''}`,
      assign: joinAssign(names),
    });
  });

  week.ministry.forEach((part) => {
    const names = part.assign.map((_, index) => getAssignName(week, getAssign, `${weekId}_${part.id}_${index}`, part.assign[index] ?? ''));
    rows.push({
      time: part.time,
      section: '用心準備傳道工作',
      item: `${part.partNum}. ${part.title}`,
      meta: `${part.dur}${part.roleLabel ? ` · ${part.roleLabel}` : ''}`,
      assign: joinAssign(names),
    });
  });

  rows.push(
    { time: week.midSongTime, section: '基督徒的生活', item: `唱詩 ${week.midSong} 首`, meta: '中場', assign: '' },
  );

  week.living.forEach((part) => {
    const names = part.assign.map((_, index) => getAssignName(week, getAssign, `${weekId}_${part.id}_${index}`, part.assign[index] ?? ''));
    rows.push({
      time: part.time,
      section: '基督徒的生活',
      item: `${part.partNum}. ${part.title}`,
      meta: `${part.dur}${part.roleLabel ? ` · ${part.roleLabel}` : ''}`,
      assign: joinAssign(names),
    });
  });

  rows.push(
    { time: week.closingTime, section: '基督徒的生活', item: '結語', meta: week.closingDur || '', assign: '' },
    { time: week.closeSongTime, section: '基督徒的生活', item: `唱詩 ${week.closeSong} 首`, meta: '結束', assign: '' },
    {
      time: '',
      section: '會眾項目',
      item: '結束禱告',
      meta: '',
      assign: getAssignName(week, getAssign, `${weekId}_closePrayer`, week.closePrayer),
    },
  );

  return rows;
}

function formatRowsForExcel(week, getAssign) {
  const rows = [];
  rows.push(['週中', getWeekLabel(week), '', '', '', '']);
  rows.push(['時間', '區段', '項目', '指派', '時長', '備註']);

  getRowDefinitions(week, getAssign).forEach((row) => {
    rows.push([
      row.time || '',
      row.section || '',
      row.item || '',
      row.assign || '',
      row.meta || '',
      '',
    ]);
  });

  return rows;
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

function buildSheetXml(rows, cols = [18, 18, 48, 36, 22, 18]) {
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

export function buildXlsxBuffer(rows, { sheetName = '週中', cols } = {}) {
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
    <sheet name="週中" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`);
  zip.file('xl/worksheets/sheet1.xml', buildSheetXml(rows));
  // Tag the blob with the real spreadsheet MIME type. Without it the download
  // carries no content-type and mobile file handlers open it as a raw zip of
  // XML parts instead of in a spreadsheet app.
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function getMidweekExportFilename(week, ext) {
  return `${sanitizeFilename(getWeekLabel(week)) || 'midweek'}.${ext}`;
}

export async function downloadWeekXlsx(week, getAssign) {
  const rows = formatRowsForExcel(week, getAssign);
  const blob = await buildXlsxBuffer(rows);
  triggerDownload(blob, getMidweekExportFilename(week, 'xlsx'));
}

export async function exportWeeksXlsx(weeks, getAssign) {
  if (!weeks.length) return;
  const rows = [];
  weeks.forEach((w, i) => {
    if (i > 0) rows.push(['', '', '', '', '', '']);
    formatRowsForExcel(w, getAssign).forEach((r) => rows.push(r));
  });
  const blob = await buildXlsxBuffer(rows);
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
