'use client';

import JSZip from 'jszip';

import { buildMidweekXlsxBlob } from './midweekXlsxLayout.mjs';
import { nodeToImageBlob, triggerDownload } from './printPdf';

// Files that are NOT a PDF: the styled workbook, the JPEG/zip download and the
// plain-text schedule. Every capture, every PDF byte and every print window
// lives in `printPdf.js` — this module only names and wraps them.

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
      const hasScenario = part.cat === 'ministry' && part.scenario;
      const duration = hasScenario ? `（${part.dur}）` : '';
      const scenario = hasScenario ? `\n   情境：${part.scenario}` : '';
      lines.push(`${part.partNum}. ${part.title}${duration}：${names.length ? names.join(' / ') : '—'}${scenario}`);
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

/* ===================== JPG (one file, or a zip for many weeks) =====================
   The capture itself is `printPdf.js`; this only decides one file vs zip. The
   background is the app's page colour, matching what the 匯出 page used to paint. */

const JPG_BACKGROUND = '#ecebe7';

export async function exportNodesJpeg(nodes, weeks) {
  if (!nodes.length) return;
  if (nodes.length === 1) {
    const blob = await nodeToImageBlob(nodes[0], { background: JPG_BACKGROUND });
    triggerDownload(blob, getMidweekExportFilename(weeks[0], 'jpg'));
    return;
  }
  const zip = new JSZip();
  for (let i = 0; i < nodes.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const blob = await nodeToImageBlob(nodes[i], { background: JPG_BACKGROUND });
    zip.file(`${sanitizeFilename(getWeekLabel(weeks[i]))}.jpg`, blob);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  triggerDownload(out, getMultiWeekExportFilename(weeks, 'zip'));
}
