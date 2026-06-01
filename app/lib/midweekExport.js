'use client';

import JSZip from 'jszip';

const EXPORT_WIDTH = 1600;
const LEFT = 80;
const RIGHT = 80;
const TOP = 86;
const BOTTOM = 82;

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizeFilename(value) {
  return String(value ?? 'midweek')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\.$/, '');
}

function getWeekLabel(week) {
  return week?.dateLabel || week?.date || '本週聚會';
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

function wrapText(ctx, text, maxWidth) {
  const value = String(text ?? '');
  if (!value) return [''];
  const lines = [];
  let line = '';

  for (const ch of value) {
    const next = line + ch;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      continue;
    }
    lines.push(line);
    line = ch;
  }

  if (line) lines.push(line);
  return lines;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function sectionColor(section) {
  if (section.includes('寶藏')) return '#6f6f6f';
  if (section.includes('傳道')) return '#b58a08';
  if (section.includes('生活')) return '#8c2b22';
  return '#2f6f8f';
}

function formatRowsForExcel(week, getAssign) {
  const rows = [];
  rows.push(['本週聚會', getWeekLabel(week), '', '', '', '']);
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

function buildSheetXml(rows) {
  const cols = [18, 18, 48, 36, 22, 18];
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

function buildXlsxBuffer(rows) {
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
    <sheet name="本週聚會" sheetId="1" r:id="rId1"/>
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
  return zip.generateAsync({ type: 'blob' });
}

function buildPrintHtml(week, getAssign) {
  const rows = getRowDefinitions(week, getAssign);
  const sectionHeader = `
    <div class="header">
      <div class="eyebrow">本週聚會</div>
      <h1>${escapeHtml(getWeekLabel(week))}</h1>
      <div class="reading">每週閱讀經文：${escapeHtml(week?.reading || '')}</div>
      <div class="header-meta">
        <span>${escapeHtml(week?.weekdayPill || '')}</span>
        <span>開場唱詩 ${escapeHtml(week?.openSong || '')} 首</span>
        <span>中場唱詩 ${escapeHtml(week?.midSong || '')} 首</span>
        <span>結束唱詩 ${escapeHtml(week?.closeSong || '')} 首</span>
      </div>
    </div>`;

  const sections = [
    ['週次資訊', rows.slice(0, 2)],
    ['會眾項目', rows.slice(2, 5).concat(rows.slice(-1))],
    ['上帝話語的寶藏', rows.filter((row) => row.section === '上帝話語的寶藏' && row.item.includes('1.'))],
    ['用心準備傳道工作', rows.filter((row) => row.section === '用心準備傳道工作')],
    ['基督徒的生活', rows.filter((row) => row.section === '基督徒的生活' && row.item !== '結束禱告')],
  ];

  const body = sections.map(([title, items]) => {
    if (!items.length) return '';
    const lines = items.map((row) => `
      <tr>
        <td class="time">${escapeHtml(row.time)}</td>
        <td class="item">${escapeHtml(row.item)}</td>
        <td class="meta">${escapeHtml(row.meta)}</td>
        <td class="assign">${escapeHtml(row.assign)}</td>
      </tr>`).join('');
    return `
      <section class="section">
        <div class="section-title">${escapeHtml(title)}</div>
        <table>${lines}</table>
      </section>`;
  }).join('');

  return `<!doctype html>
  <html lang="zh-Hant">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(getWeekLabel(week))} - 本週聚會</title>
      <style>
        :root {
          color-scheme: light;
          --ink: #211f1c;
          --ink-2: #57534d;
          --line: #ddd9d0;
          --bg: #f1efe9;
          --surface: #fff;
          --accent: #2f6f8f;
          --treasures: #6f6f6f;
          --ministry: #b58a08;
          --living: #8c2b22;
        }
        @page { size: A4; margin: 10mm; }
        * { box-sizing: border-box; }
        body {
          margin: 0;
          font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif;
          color: var(--ink);
          background: var(--bg);
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .page {
          max-width: 1024px;
          margin: 0 auto;
          padding: 18px;
        }
        .card {
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(33,31,28,.08);
        }
        .header {
          padding: 22px 24px 18px;
          border-bottom: 1px solid var(--line);
          background:
            linear-gradient(135deg, rgba(47,111,143,.08), transparent 50%),
            linear-gradient(180deg, #fff, #faf8f4);
        }
        .eyebrow {
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .08em;
          text-transform: uppercase;
          color: var(--accent);
        }
        h1 {
          margin: 8px 0 6px;
          font-size: 28px;
          line-height: 1.1;
        }
        .reading { font-size: 15px; font-weight: 700; color: var(--ink-2); margin-bottom: 10px; }
        .header-meta { display: flex; flex-wrap: wrap; gap: 8px; }
        .header-meta span {
          font-size: 12px;
          font-weight: 700;
          color: var(--ink-2);
          background: #f3f1eb;
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 4px 10px;
        }
        .section { border-top: 1px solid var(--line); }
        .section-title {
          padding: 10px 24px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: .06em;
          color: #fff;
        }
        .section:nth-of-type(1) .section-title { background: var(--accent); }
        .section:nth-of-type(2) .section-title { background: #5a6f7a; }
        .section:nth-of-type(3) .section-title { background: var(--treasures); }
        .section:nth-of-type(4) .section-title { background: var(--ministry); }
        .section:nth-of-type(5) .section-title { background: var(--living); }
        table { width: 100%; border-collapse: collapse; }
        td {
          vertical-align: top;
          padding: 10px 24px;
          border-top: 1px solid #f0ede6;
          font-size: 13.5px;
        }
        tr:first-child td { border-top: 0; }
        .time { width: 92px; font-family: monospace; color: var(--ink-2); white-space: nowrap; }
        .item { width: 54%; font-weight: 700; }
        .meta { width: 18%; color: var(--ink-2); font-size: 12.5px; }
        .assign { width: 28%; color: var(--ink); font-weight: 700; }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="card">
          ${sectionHeader}
          ${body}
        </div>
      </div>
      <script>
        window.addEventListener('load', () => setTimeout(() => window.print(), 150));
      </script>
    </body>
  </html>`;
}

export function getMidweekExportFilename(week, ext) {
  return `${sanitizeFilename(getWeekLabel(week)) || 'midweek'}.${ext}`;
}

export function renderWeekToCanvas(week, getAssign) {
  const rows = getRowDefinitions(week, getAssign);
  const canvas = document.createElement('canvas');
  canvas.width = EXPORT_WIDTH;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('無法建立繪圖畫布。');

  const contentWidth = EXPORT_WIDTH - LEFT - RIGHT;
  const innerPad = 38;
  const innerRight = 30;
  const timeCol = 110;
  const metaCol = 190;
  const assignCol = 270;
  const colGap = 20;
  const itemCol = contentWidth - innerPad - innerRight - timeCol - metaCol - assignCol - colGap * 2;

  const titleFont = '700 24px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  const metaFont = '600 17px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  const assignFont = '700 18px "Noto Sans TC", "Microsoft JhengHei", sans-serif';

  const rowHeights = rows.map((row) => {
    ctx.font = titleFont;
    const titleLines = wrapText(ctx, row.item, itemCol).slice(0, 2);
    ctx.font = metaFont;
    const metaLines = wrapText(ctx, row.meta || '', metaCol).slice(0, 2);
    ctx.font = assignFont;
    const assignLines = wrapText(ctx, row.assign || '', assignCol).slice(0, 2);
    const titleHeight = Math.max(1, titleLines.length) * 30;
    const metaHeight = Math.max(1, metaLines.length) * 22;
    const assignHeight = Math.max(1, assignLines.length) * 24;
    return Math.max(70, 18 + Math.max(titleHeight + metaHeight, assignHeight));
  });

  const bands = rows.reduce((acc, row, index) => {
    if (row.section !== acc.lastSection) {
      acc.items.push({ type: 'band', section: row.section });
      acc.lastSection = row.section;
    }
    acc.items.push({ type: 'row', row, index });
    return acc;
  }, { items: [], lastSection: null }).items;

  const extraBandHeight = bands.filter((entry) => entry.type === 'band').length * 36;
  const totalHeight = TOP + BOTTOM + rowHeights.reduce((sum, value) => sum + value, 0) + extraBandHeight + 12;
  canvas.height = totalHeight;

  // background
  const bgGradient = ctx.createLinearGradient(0, 0, 0, totalHeight);
  bgGradient.addColorStop(0, '#f4f1ea');
  bgGradient.addColorStop(1, '#e8e5df');
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, EXPORT_WIDTH, totalHeight);

  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (let i = 0; i < 8; i += 1) {
    ctx.beginPath();
    ctx.arc(140 + i * 180, 120 + (i % 2) * 40, 70 + (i % 3) * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  const cardX = LEFT;
  const cardY = 40;
  const cardW = EXPORT_WIDTH - LEFT - RIGHT;
  const cardH = totalHeight - 60;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(33,31,28,.12)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 10;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(227,225,219,.95)';
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 28);
  ctx.stroke();

  const headerHeight = 160;
  const headerGradient = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + headerHeight);
  headerGradient.addColorStop(0, 'rgba(47,111,143,.10)');
  headerGradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = headerGradient;
  drawRoundedRect(ctx, cardX + 1, cardY + 1, cardW - 2, headerHeight, 28);
  ctx.fill();

  ctx.fillStyle = '#2f6f8f';
  ctx.font = '800 18px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.fillText('本週聚會', cardX + 30, cardY + 34);
  ctx.fillStyle = '#211f1c';
  ctx.font = '900 34px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.fillText(getWeekLabel(week), cardX + 30, cardY + 76);

  ctx.font = '700 19px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#57534d';
  const readingLines = wrapText(ctx, `每週閱讀經文：${week?.reading || ''}`, cardW - 60).slice(0, 2);
  readingLines.forEach((line, i) => {
    ctx.fillText(line, cardX + 30, cardY + 112 + i * 24);
  });

  const pillY = cardY + 24;
  const pillTexts = [week?.weekdayPill, `開場唱詩 ${week?.openSong || ''} 首`, `中場唱詩 ${week?.midSong || ''} 首`, `結束唱詩 ${week?.closeSong || ''} 首`].filter(Boolean);
  let pillX = cardX + cardW - 30;
  ctx.font = '700 15px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
  pillTexts.slice().reverse().forEach((text) => {
    const w = ctx.measureText(text).width + 26;
    pillX -= w;
    ctx.fillStyle = 'rgba(47,111,143,.12)';
    drawRoundedRect(ctx, pillX, pillY, w - 8, 30, 999);
    ctx.fill();
    ctx.fillStyle = '#2f6f8f';
    ctx.fillText(text, pillX + 13, pillY + 20);
    pillX -= 10;
  });

  let y = cardY + headerHeight + 18;
  bands.forEach((entry) => {
    if (entry.type === 'band') {
      const title = entry.section;
      const color = sectionColor(title);
      ctx.fillStyle = color;
      drawRoundedRect(ctx, cardX + 20, y, cardW - 40, 34, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '800 16px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
      ctx.fillText(title, cardX + 36, y + 22);
      y += 48;
      return;
    }

    const row = entry.row;
    const idx = entry.index;
    const rowHeight = rowHeights[idx];
    const rowY = y;
    const fill = idx % 2 === 0 ? '#fcfbf8' : '#ffffff';
    ctx.fillStyle = fill;
    drawRoundedRect(ctx, cardX + 18, rowY, cardW - 36, rowHeight, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(227,225,219,.95)';
    ctx.lineWidth = 1;
    drawRoundedRect(ctx, cardX + 18, rowY, cardW - 36, rowHeight, 18);
    ctx.stroke();

    const timeX = cardX + innerPad;
    const itemX = timeX + timeCol;
    const metaX = itemX + itemCol + colGap;
    const assignX = metaX + metaCol + colGap;

    ctx.font = '700 18px "SFMono-Regular", "Roboto Mono", "Noto Sans TC", monospace';
    ctx.fillStyle = '#8c877f';
    ctx.fillText(row.time || '', timeX, rowY + 26);

    ctx.fillStyle = '#211f1c';
    ctx.font = '700 23px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    const itemLines = wrapText(ctx, row.item || '', itemCol).slice(0, 2);
    itemLines.forEach((line, lineIndex) => {
      ctx.fillText(line, itemX, rowY + 28 + lineIndex * 30);
    });

    if (row.meta) {
      ctx.fillStyle = '#8c877f';
      ctx.font = '600 17px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
      const metaLines = wrapText(ctx, row.meta, metaCol).slice(0, 2);
      metaLines.forEach((line, lineIndex) => {
        ctx.fillText(line, metaX, rowY + 28 + lineIndex * 22);
      });
    }

    if (row.assign) {
      ctx.fillStyle = '#2f6f8f';
      ctx.font = '700 18px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
      const assignLines = wrapText(ctx, row.assign, assignCol).slice(0, 2);
      assignLines.forEach((line, lineIndex) => {
        ctx.fillText(line, assignX, rowY + 28 + lineIndex * 24);
      });
    }

    y += rowHeight + 10;
  });

  return canvas;
}

export async function downloadWeekJpeg(week, getAssign) {
  const canvas = renderWeekToCanvas(week, getAssign);
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) reject(new Error('無法產生 JPG。'));
      else resolve(result);
    }, 'image/jpeg', 0.94);
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getMidweekExportFilename(week, 'jpg');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyWeekImageToClipboard(week, getAssign) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    throw new Error('目前瀏覽器不支援圖片剪貼簿。');
  }

  const canvas = renderWeekToCanvas(week, getAssign);
  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': new Promise((resolve, reject) => {
        canvas.toBlob((result) => {
          if (!result) reject(new Error('無法建立圖片。'));
          else resolve(result);
        }, 'image/png');
      }),
    }),
  ]);
}

export async function downloadWeekXlsx(week, getAssign) {
  const rows = formatRowsForExcel(week, getAssign);
  const blob = await buildXlsxBuffer(rows);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getMidweekExportFilename(week, 'xlsx');
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function openWeekPrintWindow(week, getAssign) {
  const html = buildPrintHtml(week, getAssign);
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=1200,height=900');
  if (!popup) throw new Error('瀏覽器阻擋了列印視窗。');
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  return popup;
}

export function getMidweekExportLabel(week) {
  return getWeekLabel(week);
}

export function openWeekendPrintWindow(rows, getAssign, thisYear) {
  const yr = thisYear ?? new Date().getFullYear();
  const cols = ['日期', '編號', '演講主題', '會眾', '講者', '主席', '守望台', '朗讀', '招待', '外地演講安排'];
  const thCells = cols.map(c => `<th>${escapeHtml(c)}</th>`).join('');
  const bodyRows = rows.map((r, i) => {
    if (r.type === 'event') {
      return `<tr class="ev"><td>${escapeHtml(r.date)}</td><td colspan="9"><strong>◆ ${escapeHtml(r.label)}</strong>　${escapeHtml(r.note ?? '')}</td></tr>`;
    }
    const key = `we${r._id ?? i}`;
    const sp = getAssign(`${key}_speaker`, r.speaker) || '';
    const ch = getAssign(`${key}_chair`, r.chair) || '';
    const wt = getAssign(`${key}_wt`, r.wt) || '';
    const rd = getAssign(`${key}_read`, r.read) || '';
    const cls = r.type === 'special' ? ' class="sp"' : '';
    return `<tr${cls}>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.no ?? '')}</td>
      <td class="topic">${escapeHtml(r.topic ?? '')}</td>
      <td>${escapeHtml(r.cong ?? '')}</td>
      <td>${escapeHtml(sp)}</td>
      <td>${escapeHtml(ch)}</td>
      <td>${escapeHtml(wt)}</td>
      <td>${escapeHtml(rd)}</td>
      <td>${escapeHtml(r.host ?? '')}</td>
      <td>${escapeHtml(r.away ?? '')}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"/>
<title>新屋會眾 ${yr} 週末聚會安排表</title>
<style>
  body { font-family: 'Noto Sans TC', 'PingFang TC', sans-serif; font-size: 13px; color: #1a1a1a; margin: 0; padding: 24px; }
  h1 { font-size: 18px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #333; color: #fff; font-size: 12px; letter-spacing: .05em; padding: 8px 10px; text-align: left; white-space: nowrap; }
  td { padding: 8px 10px; border-bottom: 1px solid #ddd; vertical-align: middle; white-space: nowrap; }
  tr:nth-child(even) td { background: #f8f7f4; }
  td.topic { white-space: normal; min-width: 220px; font-weight: 600; }
  tr.ev td { background: #f1efe9 !important; font-weight: 700; text-align: center; color: #c23123; }
  tr.ev td:first-child { text-align: left; }
  tr.sp td { background: #fbeeec !important; font-weight: 700; color: #c23123; }
  @media print { body { padding: 0; } }
</style></head><body>
<h1>新屋會眾 ${yr} 週末聚會安排表</h1>
<table><thead><tr>${thCells}</tr></thead><tbody>${bodyRows}</tbody></table>
</body></html>`;

  const popup = window.open('', '_blank', 'noopener,noreferrer,width=1400,height=900');
  if (!popup) throw new Error('瀏覽器阻擋了列印視窗。');
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.focus();
  return popup;
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

function jpegImageFromCanvas(canvas) {
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  return { bytes: dataUrlToUint8(dataUrl), width: canvas.width, height: canvas.height };
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
    const availW = PAGE_W - MARGIN * 2;
    const availH = PAGE_H - MARGIN * 2;
    const scale = Math.min(availW / img.width, availH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const x = (PAGE_W - drawW) / 2;
    const y = (PAGE_H - drawH) / 2;

    startObj(pageNum);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W.toFixed(2)} ${PAGE_H.toFixed(2)}] /Resources << /XObject << /Im0 ${imageNum} 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`);

    const content = `q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
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
  lines.push(`📋 本週聚會 — ${getWeekLabel(week)}`);
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

export function buildWeeksText(weeks, getAssign) {
  return weeks.map((w) => buildWeekText(w, getAssign)).join('\n\n──────────\n\n');
}

/* ===================== Multi-week exporters (匯出 page) ===================== */

export async function exportWeeksJpeg(weeks, getAssign) {
  if (!weeks.length) return;
  if (weeks.length === 1) { await downloadWeekJpeg(weeks[0], getAssign); return; }
  const zip = new JSZip();
  for (const w of weeks) {
    const canvas = renderWeekToCanvas(w, getAssign);
    // eslint-disable-next-line no-await-in-loop
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('無法產生圖片。'))), 'image/jpeg', 0.92);
    });
    zip.file(`${sanitizeFilename(getWeekLabel(w))}.jpg`, blob);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  triggerDownload(out, `本週聚會_${weeks.length}週.zip`);
}

export function exportWeeksPdf(weeks, getAssign) {
  if (!weeks.length) return;
  const images = weeks.map((w) => jpegImageFromCanvas(renderWeekToCanvas(w, getAssign)));
  const blob = jpegImagesToPdfBlob(images);
  triggerDownload(blob, weeks.length === 1 ? getMidweekExportFilename(weeks[0], 'pdf') : `本週聚會_${weeks.length}週.pdf`);
}

export async function exportWeeksXlsx(weeks, getAssign) {
  if (!weeks.length) return;
  const rows = [];
  weeks.forEach((w, i) => {
    if (i > 0) rows.push(['', '', '', '', '', '']);
    formatRowsForExcel(w, getAssign).forEach((r) => rows.push(r));
  });
  const blob = await buildXlsxBuffer(rows);
  triggerDownload(blob, weeks.length === 1 ? getMidweekExportFilename(weeks[0], 'xlsx') : `本週聚會_${weeks.length}週.xlsx`);
}

/* ===== DOM-node exporters (screenshot the real card so the output matches it exactly) =====
   Unlike the renderWeekToCanvas exporters above (which hand-redraw the week and have
   drifted from the live card), these capture an actual rendered MidweekWeek card via
   html-to-image — identical to the meetings-page export. The caller passes the rendered
   card DOM nodes (one per week, in the same order as `weeks`). */

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
  triggerDownload(out, `本週聚會_${nodes.length}週.zip`);
}

export async function exportNodesPdf(nodes, weeks) {
  if (!nodes.length) return;
  const images = [];
  for (const node of nodes) {
    // eslint-disable-next-line no-await-in-loop
    images.push(await jpegDataUrlToImage(await nodeToJpegDataUrl(node)));
  }
  const blob = jpegImagesToPdfBlob(images);
  triggerDownload(blob, nodes.length === 1 ? getMidweekExportFilename(weeks[0], 'pdf') : `本週聚會_${nodes.length}週.pdf`);
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
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>本週聚會</title>
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

export function openWeeksPrintWindow(weeks, getAssign) {
  if (!weeks.length) throw new Error('沒有可列印的週次。');
  const imgs = weeks
    .map((w) => `<img src="${renderWeekToCanvas(w, getAssign).toDataURL('image/jpeg', 0.92)}" />`)
    .join('');
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=900');
  if (!popup) throw new Error('瀏覽器阻擋了列印視窗。');
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>本週聚會</title>
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
