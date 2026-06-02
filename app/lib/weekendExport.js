'use client';

import { buildXlsxBuffer, triggerDownload } from './midweekExport';

// Weekend rows are the public-talk schedule. `getAssign` lets exports reflect
// the live (unsaved) overrides the same way the on-screen table does.
function val(getAssign, rowId, field, fallback) {
  if (typeof getAssign !== 'function') return fallback || '';
  return getAssign(`we${rowId}_${field}`, fallback) || '';
}

function isEventLike(r) {
  return r.type === 'event' || r.type === 'suspended';
}

const WEEKEND_HEADERS = ['日期', '編號', '演講主題', '會眾', '講者', '主席', '守望台', '朗讀', '招待', '外地演講安排'];
const WEEKEND_COLS = [12, 10, 40, 18, 16, 16, 16, 16, 16, 22];

function rowCells(r, getAssign) {
  if (isEventLike(r)) {
    return [r.date || '', '', `◆ ${r.label || ''}${r.note ? ` — ${r.note}` : ''}`, '', '', '', '', '', '', ''];
  }
  return [
    r.date || '',
    r.no || '',
    r.topic || '',
    r.cong || '',
    val(getAssign, r._id, 'speaker', r.speaker),
    val(getAssign, r._id, 'chair', r.chair),
    val(getAssign, r._id, 'wt', r.wt),
    val(getAssign, r._id, 'read', r.read),
    r.host || '',
    r.away || '',
  ];
}

export async function downloadWeekendXlsx(rows, getAssign, filename = '週末.xlsx') {
  const data = [WEEKEND_HEADERS, ...rows.map((r) => rowCells(r, getAssign))];
  const blob = await buildXlsxBuffer(data, { sheetName: '週末', cols: WEEKEND_COLS });
  triggerDownload(blob, filename);
}

// Plain-text weekend schedule, suitable for pasting into a LINE group.
export function buildWeekendText(rows, getAssign) {
  const lines = ['📋 公眾演講安排表', ''];
  for (const r of rows) {
    if (isEventLike(r)) {
      lines.push(`${r.date || ''}　◆ ${r.label || ''}${r.note ? `（${r.note}）` : ''}`);
      lines.push('');
      continue;
    }
    lines.push(`${r.date || ''}${r.no ? `　編號 ${r.no}` : ''}`);
    if (r.topic) lines.push(`主題：${r.topic}`);
    const speaker = val(getAssign, r._id, 'speaker', r.speaker);
    if (speaker) lines.push(`講者：${speaker}${r.cong ? `（${r.cong}）` : ''}`);
    const chair = val(getAssign, r._id, 'chair', r.chair);
    if (chair) lines.push(`主席：${chair}`);
    const wt = val(getAssign, r._id, 'wt', r.wt);
    if (wt) lines.push(`守望台：${wt}`);
    const read = val(getAssign, r._id, 'read', r.read);
    if (read) lines.push(`朗讀：${read}`);
    if (r.host) lines.push(`招待：${r.host}`);
    if (r.away) lines.push(`外地演講：${r.away}`);
    lines.push('');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
