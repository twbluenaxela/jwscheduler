'use client';

import JSZip from 'jszip';

import { buildMidweekXlsxBlob } from './midweekXlsxLayout.mjs';
import { dataUrlToUint8, singleImagePages, writePdf } from './pdfWriter.mjs';
import { A4_PT, paginate, placeCells } from './pdfLayout.mjs';
import { isMidweekSuspended } from './weekType.mjs';

// Re-exported so the existing import sites (ImportPage, MeetingsPage) don't have
// to know the workbook moved into a Node-loadable module.
export { buildMidweekXlsxBlob };
export { buildXlsxBuffer } from './xlsx.mjs';

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

export function getMidweekExportFilename(week, ext) {
  return `${sanitizeFilename(getWeekLabel(week)) || 'midweek'}.${ext}`;
}

// Multi-week filename carries the actual date range (e.g. "週中_9月7-13日~10月5-11日.xlsx")
// instead of just the week count, so a downloaded file is identifiable without opening it.
export function getMultiWeekExportFilename(weeks, ext) {
  if (!weeks?.length) return `週中.${ext}`;
  if (weeks.length === 1) return getMidweekExportFilename(weeks[0], ext);
  const first = sanitizeFilename(getWeekLabel(weeks[0]));
  const last = sanitizeFilename(getWeekLabel(weeks[weeks.length - 1]));
  const range = first && last && first !== last ? `${first}~${last}` : (first || last || `${weeks.length}週`);
  return `週中_${range}.${ext}`;
}

export async function downloadWeekXlsx(week, getAssign) {
  const blob = await buildMidweekXlsxBlob([week], getAssign);
  triggerDownload(blob, getMidweekExportFilename(week, 'xlsx'));
}

export async function exportWeeksXlsx(weeks, getAssign) {
  if (!weeks.length) return;
  const blob = await buildMidweekXlsxBlob(weeks, getAssign);
  triggerDownload(blob, getMultiWeekExportFilename(weeks, 'xlsx'));
}

/* ===================== Shared download / PDF helpers ===================== */

// Pin html-to-image to the element's real rendered box so the capture has no
// extra whitespace on the right (mobile screenshots were padded out otherwise).
export function captureBox(node) {
  const rect = node.getBoundingClientRect();
  return { width: Math.ceil(rect.width), height: Math.ceil(rect.height) };
}

export function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  return new Blob([writePdf(singleImagePages(images))], { type: 'application/pdf' });
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
  triggerDownload(out, getMultiWeekExportFilename(weeks, 'zip'));
}

export async function exportNodesPdf(nodes, weeks) {
  if (!nodes.length) return;
  const images = [];
  for (const node of nodes) {
    // eslint-disable-next-line no-await-in-loop
    images.push(await jpegDataUrlToImage(await nodeToJpegDataUrl(node)));
  }
  const blob = jpegImagesToPdfBlob(images);
  triggerDownload(blob, getMultiWeekExportFilename(weeks, 'pdf'));
}

// N weeks per A4 page, laid out on the grid the user picked in 版面.
//
// Same capture path as every other visual export — real MidweekWeek cards
// screenshotted with html-to-image — so the pages look like the live card rather
// than a redrawn approximation. The cards are then placed as images on shared
// pages; a cancelled week becomes a full-width notice band that does not use up
// one of the N boxes (its card is already collapsed to a one-line notice).
export async function exportNodesPdfGrid(nodes, weeks, layout) {
  if (!nodes.length) return;
  const images = {};
  for (let i = 0; i < weeks.length; i += 1) {
    const node = nodes[i];
    if (!node) continue;
    // eslint-disable-next-line no-await-in-loop
    images[i] = await jpegDataUrlToImage(await nodeToJpegDataUrl(node));
  }

  const sizes = Object.fromEntries(
    Object.entries(images).map(([i, img]) => [i, { width: img.width, height: img.height }]),
  );
  const pages = paginate(weeks, layout, isMidweekSuspended).map((page) => ({
    w: A4_PT.w,
    h: A4_PT.h,
    images: placeCells(page, layout, sizes)
      .filter((cell) => images[cell.item])
      .map((cell) => ({ img: images[cell.item], x: cell.x, y: cell.y, w: cell.w, h: cell.h })),
  }));
  if (!pages.length) throw new Error('沒有可匯出的週次。');

  // Paper white, not the app's warm background: these pages get printed.
  const blob = new Blob([writePdf(pages, [1, 1, 1])], { type: 'application/pdf' });
  triggerDownload(blob, getMultiWeekExportFilename(weeks, 'pdf'));
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
