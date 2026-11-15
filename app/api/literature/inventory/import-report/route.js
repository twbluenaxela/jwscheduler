export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../lib/db';
import { auth, fail, invalid, mapped } from '../../../../lib/literatureApi';
import { pdfToText } from '../../../../lib/pdfText';
import { parseHubInventoryReport } from '../../../../lib/literatureInventory.mjs';
import { importHubReport, matchHubReport } from '../../../../lib/inventoryServer';

export async function POST(request) {
  try {
    const congregationId = await auth(request);
    const file = (await request.formData()).get('file');
    if (!file || typeof file.arrayBuffer !== 'function' || file.type !== 'application/pdf') invalid('請選擇 PDF 檔案');
    if (file.size > 5 * 1024 * 1024) throw Object.assign(new Error('檔案不得超過 5 MB'), { status: 413 });
    let report;
    try { report = parseHubInventoryReport(await pdfToText(await file.arrayBuffer())); }
    catch (error) { invalid(error.message); }
    if (new URL(request.url).searchParams.get('preview') === '1') {
      const [publications, existing] = await Promise.all([
        db.publication.findMany({ where: { congregationId } }),
        db.inventoryCount.findUnique({ where: { congregationId_month: { congregationId, month: report.month } } }),
      ]);
      const rows = matchHubReport(report, publications);
      return NextResponse.json(mapped({ ...report, rows, duplicate: existing?.status === 'done' }));
    }
    const count = await importHubReport(congregationId, report);
    return NextResponse.json(mapped({ count }));
  } catch (error) { return fail(error); }
}
