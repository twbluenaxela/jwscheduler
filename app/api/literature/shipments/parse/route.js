export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../lib/db';
import { auth, fail, invalid, mapped } from '../../../../lib/literatureApi';
import { pdfToText } from '../../../../lib/pdfText';
import { parsePackingSlip, matchShipmentLines } from '../../../../lib/literatureShipments.mjs';
export async function POST(request) {
  try {
    const congregationId = await auth(request);
    const file = (await request.formData()).get('file');
    if (!file || typeof file.arrayBuffer !== 'function' || file.type !== 'application/pdf') invalid('請選擇 PDF 檔案');
    if (file.size > 5 * 1024 * 1024) throw Object.assign(new Error('檔案不得超過 5 MB'), { status: 413 });
    let parsed;
    try { parsed = parsePackingSlip(await pdfToText(await file.arrayBuffer())); } catch (error) { invalid(error.message); }
    const [publications, duplicate] = await Promise.all([db.publication.findMany({ where: { congregationId } }), db.shipment.findUnique({ where: { congregationId_slipNumber: { congregationId, slipNumber: parsed.slipNumber } } })]);
    const lines = matchShipmentLines(parsed.lines, publications).map(line => ({ ...line, publication: publications.find(p => p.id === line.publicationId) ?? null }));
    return NextResponse.json(mapped({ ...parsed, lines, duplicate: !!duplicate }));
  } catch (error) { return fail(error); }
}
