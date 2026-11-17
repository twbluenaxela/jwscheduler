export const dynamic = 'force-dynamic';
import db from '../../../lib/db';
import { auth, fail, mapped } from '../../../lib/literatureApi';
import { mapPublication, withCoverFallback } from '../../../lib/literature.mjs';
import { buildOrderList } from '../../../lib/literatureOrders.mjs';

export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const [requests, publications, counts, subscriptions, shipments, deliveries, people] = await Promise.all([
      db.literatureRequest.findMany({ where: { congregationId }, include: { person: true } }),
      db.publication.findMany({ where: { congregationId } }),
      db.inventoryCount.findMany({ where: { congregationId }, include: { lines: true } }),
      db.literatureSubscription.findMany({ where: { congregationId } }),
      db.shipment.findMany({ where: { congregationId }, include: { lines: { include: { publication: true } } }, orderBy: { createdAt: 'desc' } }),
      db.literatureDelivery.findMany({ where: { congregationId } }),
      db.person.findMany({ where: { congregationId } }),
    ]);
    const result = buildOrderList({ requests, publications: withCoverFallback(publications.map(mapPublication)), counts, subscriptions, shipments, deliveries, people });
    return Response.json(mapped({ ...result, hasInventoryCount: counts.length > 0 }));
  } catch (error) {
    return fail(error);
  }
}
