export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../lib/db';
import { auth, fail, id, quantity, mapped, scoped, invalid } from '../../../lib/literatureApi';
export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const shipmentId = id(new URL(request.url).searchParams.get('shipmentId'));
    await scoped('shipment', shipmentId, congregationId);
    return NextResponse.json({ deliveries: mapped(await db.literatureDelivery.findMany({ where: { congregationId, shipmentId } })) });
  } catch (error) { return fail(error); }
}
export async function POST(request) {
  try {
    const congregationId = await auth(request), body = await request.json();
    const personId = id(body.personId), publicationId = id(body.publicationId);
    await scoped('person', personId, congregationId);
    await scoped('publication', publicationId, congregationId);
    const shipmentId = body.shipmentId == null ? null : id(body.shipmentId);
    const requestId = body.requestId == null ? null : id(body.requestId);
    if (shipmentId) await scoped('shipment', shipmentId, congregationId);
    if (requestId) {
      const item = await scoped('literatureRequest', requestId, congregationId);
      if (item.personId !== personId || item.publicationId !== publicationId || item.status === 'cancelled') invalid('申請與發放資料不符');
    }
    const amount = quantity(body.quantity);
    const delivery = await db.$transaction(async tx => {
      const result = await tx.literatureDelivery.create({ data: { congregationId, personId, publicationId, quantity: amount, shipmentId, requestId } });
      if (requestId) await tx.literatureRequest.update({ where: { id: requestId }, data: { status: 'delivered', deliveredAt: result.deliveredAt } });
      return result;
    });
    return NextResponse.json({ delivery: mapped(delivery) });
  } catch (error) { return fail(error); }
}
