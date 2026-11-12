'use client';

import { buildMidweekXlsxBlob } from './midweekXlsxLayout.mjs';
import { DRIVE_FOLDER_ID, requestDriveToken, upsertFile } from './googleDriveClient';

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export async function syncWeeksToDrive(weeks, getAssign) {
  const token = await requestDriveToken();

  const groups = new Map();
  for (const w of weeks ?? []) {
    let key;
    let filename;
    if (w.isoDate) {
      key = w.isoDate.slice(0, 7);
      filename = `週中_${key}.xlsx`;
    } else {
      const m = String(w.date || w.dateLabel || '').match(/(\d+)月/);
      const month = m ? m[1].padStart(2, '0') : '00';
      key = `m${month}`;
      filename = `週中_${month}月.xlsx`;
    }
    if (!groups.has(key)) groups.set(key, { key, filename, weeks: [] });
    groups.get(key).weeks.push(w);
  }

  const results = [];
  for (const g of groups.values()) {
    const blob = await buildMidweekXlsxBlob(g.weeks, getAssign);
    const buf = await blob.arrayBuffer();
    const res = await upsertFile({
      folderId: DRIVE_FOLDER_ID,
      filename: g.filename,
      content: new Uint8Array(buf),
      mimeType: MIME,
      accessToken: token,
    });
    results.push(res);
  }
  return results;
}