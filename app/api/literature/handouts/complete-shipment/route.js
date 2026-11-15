export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../lib/db';
import { auth, fail, id, scoped } from '../../../../lib/literatureApi';
import { loadHandoutData } from '../../../../lib/literatureHandoutData';
import { pendingHandouts } from '../../../../lib/literatureShipments.mjs';

export async function POST(request) {
  try {
    const congregationId = await auth(request);
    const shipmentId = id((await request.json()).shipmentId);
    await scoped('shipment', shipmentId, congregationId);
    const data = await loadHandoutData(congregationId);
    const shipment = data.shipments.find(s => s.id === shipmentId);
    if (!shipment) {
      return NextResponse.json({ error: '找不到近期裝箱單' }, { status: 404 });
    }
    const people = pendingHandouts({ ...data, shipments: [shipment], requests: [] });
    const deliveries = people.flatMap(person => person.items.map(item => ({
      congregationId,
      personId: person.personId,
      publicationId: item.publicationId,
      quantity: item.quantity,
      shipmentId,
      requestId: item.requestId,
    })));
    await db.$transaction(async tx => {
      const subscriptions = deliveries.filter(delivery => !delivery.requestId);
      if (subscriptions.length) {
        await tx.literatureDelivery.createMany({ data: subscriptions });
      }
      for (const item of deliveries.filter(delivery => delivery.requestId)) {
        const delivery = await tx.literatureDelivery.create({ data: item });
        await tx.literatureRequest.update({
          where: { id: item.requestId },
          data: { status: 'delivered', deliveredAt: delivery.deliveredAt },
        });
      }
    }, { timeout: 60000, maxWait: 10000 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
