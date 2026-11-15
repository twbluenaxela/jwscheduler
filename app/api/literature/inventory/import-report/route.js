export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../lib/db';
import { auth, fail, invalid, mapped } from '../../../../lib/literatureApi';
import { pdfToText } from '../../../../lib/pdfText';
import { parseHubInventoryReport } from '../../../../lib/literatureInventory.mjs';
import { countData } from '../../../../lib/inventoryServer';

export async function POST(request) {
  try {
    const congregationId = await auth(request);
    const file = (await request.formData()).get('file');
    if (!file || typeof file.arrayBuffer !== 'function' || file.type !== 'application/pdf') invalid('請選擇 PDF 檔案');
    if (file.size > 5 * 1024 * 1024) throw Object.assign(new Error('檔案不得超過 5 MB'), { status: 413 });
    let report;
    try { report = parseHubInventoryReport(await pdfToText(await file.arrayBuffer())); }
    catch (error) { invalid(error.message); }
    const data = await countData(congregationId, report.month);
    const existing = await db.inventoryCount.findUnique({ where: { congregationId_month: { congregationId, month: report.month } } });
    const rows = report.items.map((item) => {
      const candidates = data.publications.filter((p) => p.code === item.code && p.language === report.language);
      const publication = candidates.find((p) => p.format === 'standard') || candidates[0];
      return { ...item, publicationId: publication?.id ?? null, action: publication ? 'match' : 'create' };
    });
    if (new URL(request.url).searchParams.get('preview') === '1') {
      return NextResponse.json(mapped({ ...report, rows, duplicate: existing?.status === 'done' }));
    }
    if (existing?.status === 'done') throw Object.assign(new Error('此月份已完成清點'), { status: 409 });
    const count = await db.$transaction(async (tx) => {
      const result = existing || await tx.inventoryCount.create({ data: { congregationId, month: report.month } });
      for (const line of data.lines) {
        await tx.inventoryLine.upsert({ where: { countId_publicationId: { countId: result.id, publicationId: line.publicationId } },
          create: { ...line, countId: result.id, onHand: 0 }, update: { onHand: 0 } });
      }
      for (const row of rows) {
        let publicationId = row.publicationId;
        if (!publicationId) {
          const category = /^T-/i.test(row.code) ? 'toolbox' : /^(wp|g)\d/i.test(row.code) ? 'magazine' : 'other';
          const publication = await tx.publication.upsert({
            where: { congregationId_code_language_format: { congregationId, code: row.code, language: report.language, format: 'standard' } },
            create: { congregationId, code: row.code, name: row.name, category, language: report.language, aliases: [], note: '由庫存報告自動新增' },
            update: {},
          });
          publicationId = publication.id;
        }
        const opening = data.previousLines.find((line) => line.publicationId === publicationId)?.onHand ?? 0;
        const received = data.received.get(publicationId) || 0;
        await tx.inventoryLine.upsert({ where: { countId_publicationId: { countId: result.id, publicationId } },
          create: { countId: result.id, publicationId, opening, received, onHand: row.quantity },
          update: { opening, received, onHand: row.quantity } });
      }
      return tx.inventoryCount.update({ where: { id: result.id }, data: { status: 'done', source: 'jwhub-report' } });
    });
    return NextResponse.json(mapped({ count }));
  } catch (error) { return fail(error); }
}
