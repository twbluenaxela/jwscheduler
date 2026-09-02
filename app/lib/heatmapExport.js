'use client';

// Download layer for the 指派分布 exports — mirrors weekendExport.js: the row
// builders are pure and live in heatmap.mjs (so they are unit-tested and shared
// with 複製文字), this file only turns them into a file.
import { buildXlsxBuffer, triggerDownload } from './midweekExport';
import { buildGridExportRows, buildPersonExportRows } from './heatmap.mjs';

function sanitizeFilename(value) {
  return String(value ?? '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '')
    .replace(/–/g, '-')
    .trim()
    .replace(/\.$/, '');
}

export function getHeatmapExportFilename(periodLabel, ext, name) {
  const period = sanitizeFilename(periodLabel);
  const who = sanitizeFilename(name);
  return `${who ? `${who}-` : ''}指派分布${period ? `_${period}` : ''}.${ext}`;
}

// One column per month, plus 姓名/性別 on the left and 件數/需要注意 on the right.
function gridCols(monthCount) {
  return [16, 8, ...Array.from({ length: monthCount }, () => 9), 8, 20];
}

export async function downloadHeatmapGridXlsx(data, mode, periodLabel) {
  const rows = buildGridExportRows(data, mode);
  const blob = await buildXlsxBuffer(rows, {
    sheetName: '指派分布',
    cols: gridCols(data.win?.length ?? 0),
  });
  triggerDownload(blob, getHeatmapExportFilename(periodLabel, 'xlsx'));
}

export async function downloadHeatmapPersonXlsx(name, gender, detail, periodLabel) {
  const rows = buildPersonExportRows(name, gender, detail);
  const blob = await buildXlsxBuffer(rows, { sheetName: '指派記錄', cols: [16, 46, 16] });
  triggerDownload(blob, getHeatmapExportFilename(periodLabel, 'xlsx', name));
}
