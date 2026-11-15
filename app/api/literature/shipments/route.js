export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../lib/db';
import { auth, fail, invalid, mapped, quantity, note } from '../../../lib/literatureApi';
import { matchShipmentLines } from '../../../lib/literatureShipments.mjs';
export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const shipments = await db.shipment.findMany({ where: { congregationId }, include: { lines: true }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ shipments: mapped(shipments.map(({ lines, ...shipment }) => ({ ...shipment, lineCount: lines.length, totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0) }))) });
  } catch (error) { return fail(error); }
}
export async function POST(request) {
  try {
    const congregationId = await auth(request), body = await request.json();
    if (typeof body.slipNumber !== 'string' || !body.slipNumber.trim() || !Array.isArray(body.lines) || !body.lines.length || !['jwhub-pdf', 'manual'].includes(body.source ?? 'jwhub-pdf')) invalid();
    const slipNumber = body.slipNumber.trim();
    let shippedAt = null;
    if (body.shippedAt != null) {
      if (typeof body.shippedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.shippedAt)) invalid('日期無效');
      shippedAt = new Date(`${body.shippedAt}T00:00:00.000Z`);
      if (Number.isNaN(shippedAt.valueOf()) || shippedAt.toISOString().slice(0, 10) !== body.shippedAt) invalid('日期無效');
    }
    for (const line of body.lines) {
      if (!line || ['rawCode', 'code', 'language', 'title'].some(key => typeof line[key] !== 'string' || !line[key].trim()) || typeof line.largePrint !== 'boolean') invalid();
      quantity(line.quantity);
    }
    const shipment = await db.$transaction(async tx => {
      const publications = await tx.publication.findMany({ where: { congregationId } });
      const matched = matchShipmentLines(body.lines, publications);
      const created = await tx.shipment.create({ data: { congregationId, slipNumber, shippedAt, source: body.source ?? 'jwhub-pdf', note: note(body.note) } });
      const newPublications = matched.filter((line) => !line.publicationId)
        .map((line) => ({ ...line.createData, congregationId }));
      if (newPublications.length) {
        await tx.publication.createMany({ data: newPublications, skipDuplicates: true });
        const added = await tx.publication.findMany({ where: { congregationId } });
        publications.splice(0, publications.length, ...added);
      }
      const resolved = matchShipmentLines(body.lines, publications);
      await tx.shipmentLine.createMany({
        data: resolved.map((line) => ({
          shipmentId: created.id,
          publicationId: line.publicationId,
          rawCode: line.rawCode,
          quantity: line.quantity,
        })),
      });
      return tx.shipment.findUnique({ where: { id: created.id }, include: { lines: true } });
    }, { timeout: 60000, maxWait: 10000 });
    return NextResponse.json({ shipment: mapped(shipment) });
  } catch (error) { return fail(error); }
}
