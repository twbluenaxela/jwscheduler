'use client';

import JSZip from 'jszip';

import { buildMidweekXlsxBlob } from './midweekXlsxLayout.mjs';
import { nodeToImageBlob, triggerDownload } from './printPdf';
import { isMidweekSuspended, suspendedNotice } from './weekType.mjs';

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
//
// It must say the same thing as the card it replaces: a cancelled week is the
// one-line 暫停 notice (not an empty heading), and every assigned name carries
// its role (學生 / 助手 / 主持 / 朗讀), because "陳大文 / 林小華" alone does not
// tell anyone who is the student and who is the helper.
export function buildWeekText(week, getAssign) {
  if (!week) return '';
  const wId = `mw${week.id}`;
  const get = (slot, fb) => (typeof getAssign === 'function' ? getAssign(slot, fb) : fb) || '';
  const lines = [];
  lines.push(`📋 週中 — ${getWeekLabel(week)}`);
  if (isMidweekSuspended(week)) {
    lines.push(suspendedNotice(week));
    return lines.join('\n').trim();
  }
  if (week.weekdayPill) lines.push(week.weekdayPill);
  if (week.reading) lines.push(`每週閱讀經文：${week.reading}`);
  lines.push('');

  const chairman = get(`${wId}_chairman`, week.chairman);
  const openPrayer = get(`${wId}_openPrayer`, week.openPrayer);
  if (chairman) lines.push(`主席：${chairman}`);
  if (openPrayer) lines.push(`開始禱告：${openPrayer}`);
  lines.push('');

  // Same pair rule as the card and the workbook: a second slot exists only for
  // a '/' roleLabel whose helper is not hidden.
  const roleNames = (part) => {
    const roles = part.roleLabel?.split('/') ?? [];
    const isPair = roles.length > 1 && !part.hideHelper;
    const count = isPair ? 2 : 1;
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const name = get(`${wId}_${part.id}_${i}`, part.assign?.[i] ?? '');
      if (!name) continue;
      const role = roles[i] || (i === 1 ? '助手' : '');
      out.push(role ? `${name}（${role}）` : name);
    }
    return out;
  };

  const section = (title, parts) => {
    if (!parts?.length) return;
    lines.push(`【${title}】`);
    parts.forEach((part) => {
      const names = roleNames(part);
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
  // Nodes are index-aligned with `weeks` and may contain holes (a card that has
  // not mounted yet). Pair before dropping, or the zip's file names slip one
  // week ahead of the picture they contain.
  const pairs = (nodes ?? [])
    .map((node, index) => ({ node, week: weeks?.[index] }))
    .filter((pair) => pair.node);
  if (!pairs.length) return;
  if (pairs.length === 1) {
    const blob = await nodeToImageBlob(pairs[0].node, { background: JPG_BACKGROUND });
    triggerDownload(blob, getMidweekExportFilename(pairs[0].week, 'jpg'));
    return;
  }
  const zip = new JSZip();
  for (let i = 0; i < pairs.length; i += 1) {
    const { node, week } = pairs[i];
    // eslint-disable-next-line no-await-in-loop
    const blob = await nodeToImageBlob(node, { background: JPG_BACKGROUND });
    zip.file(`${sanitizeFilename(getWeekLabel(week))}.jpg`, blob);
  }
  const out = await zip.generateAsync({ type: 'blob' });
  triggerDownload(out, getMultiWeekExportFilename(pairs.map((pair) => pair.week), 'zip'));
}
