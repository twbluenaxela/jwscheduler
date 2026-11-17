export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../lib/db';
import { auth, fail, mapped, scoped } from '../../../../lib/literatureApi';
import { allocateShipment } from '../../../../lib/literatureShipments.mjs';
export async function GET(request, context) {
  try {
    const congregationId = await auth(request);
    const shipment = await scoped('shipment', (await context.params).id, congregationId);
    const [lines, publications, subscriptions, requests, deliveries, people] = await Promise.all([
      db.shipmentLine.findMany({ where: { shipmentId: shipment.id } }), db.publication.findMany({ where: { congregationId } }),
      db.literatureSubscription.findMany({ where: { congregationId } }), db.literatureRequest.findMany({ where: { congregationId } }),
      db.literatureDelivery.findMany({ where: { congregationId, shipmentId: shipment.id } }), db.person.findMany({ where: { congregationId } }),
    ]);
    return NextResponse.json(mapped({ shipment, lines, allocation: allocateShipment({ lines, shippedAt: shipment.shippedAt ?? shipment.createdAt, publications, subscriptions, requests, deliveries, people }) }));
  } catch (error) { return fail(error); }
}
export async function DELETE(request, context) {
  try {
    const congregationId = await auth(request);
    const shipment = await scoped('shipment', (await context.params).id, congregationId);
    await db.shipment.delete({ where: { id: shipment.id } });
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error); }
}
