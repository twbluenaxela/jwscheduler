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
