export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { loadHandoutData } from '../../../lib/literatureHandoutData';
import { auth, fail, mapped } from '../../../lib/literatureApi';
import { handoutItem, pendingHandouts, pendingRecipientCount } from '../../../lib/literatureShipments.mjs';

export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const data = await loadHandoutData(congregationId);
    const pending = pendingHandouts(data);
    const date = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const today = new Date(`${date}T00:00:00+08:00`);
    const grouped = new Map();
    const todaysDeliveries = data.deliveries
      .filter(delivery => delivery.deliveredAt >= today)
      .sort((a, b) => b.deliveredAt - a.deliveredAt);
    for (const delivery of todaysDeliveries) {
      const person = data.people.find(p => p.id === delivery.personId);
      const publication = data.publications.find(p => p.id === delivery.publicationId);
      if (!person || !publication) continue;
      if (!grouped.has(person.id)) {
        grouped.set(person.id, {
          personId: person.id,
          name: person.name,
          serviceGroup: person.serviceGroup,
          groupRole: person.groupRole,
          items: [],
          deliveryIds: [],
          deliveredAt: delivery.deliveredAt,
        });
      }
      const group = grouped.get(person.id);
      group.items.push(handoutItem(publication, {
        ...delivery,
        source: delivery.requestId ? 'request' : 'subscription',
      }, delivery.shipmentId));
      group.deliveryIds.push(delivery.id);
    }
    for (const row of data.requests.filter(item => item.personId == null && item.status === 'delivered' && item.deliveredAt >= today)) {
      if (!row.publication) continue;
      grouped.set(`guest:${row.id}`, {
        personId: null, guestKey: `guest:${row.id}`, name: row.guestName, serviceGroup: null,
        guest: true, requestId: row.id, deliveredAt: row.deliveredAt,
        items: [handoutItem(row.publication, { ...row, requestId: row.id, source: 'request' })],
        deliveryIds: [],
      });
    }
    const olderShipments = data.shipments.slice(1).map(shipment => ({
      id: shipment.id,
      slipNumber: shipment.slipNumber,
      shippedAt: shipment.shippedAt || shipment.createdAt,
      pendingPeople: pendingRecipientCount(data.allocations.get(shipment.id), data.deliveries),
    })).filter(shipment => shipment.pendingPeople);
    return NextResponse.json(mapped({
      people: pending,
      delivered: [...grouped.values()],
      olderShipments,
    }));
  } catch (error) {
    return fail(error);
  }
}
