export const dynamic = 'force-dynamic';
import db from '../../../lib/db';
import { auth, fail, mapped } from '../../../lib/literatureApi';
import { mapPublication, withCoverFallback } from '../../../lib/literature.mjs';
import { buildOrderList } from '../../../lib/literatureOrders.mjs';

export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const [requests, publications, count, subscriptions, shipments] = await Promise.all([
      db.literatureRequest.findMany({ where: { congregationId, status: { in: ['pending', 'received'] } }, include: { person: true } }),
      db.publication.findMany({ where: { congregationId } }),
      db.inventoryCount.findFirst({ where: { congregationId }, orderBy: { month: 'desc' }, include: { lines: true } }),
      db.literatureSubscription.findMany({ where: { congregationId } }),
      db.shipment.findMany({ where: { congregationId }, include: { lines: { include: { publication: true } } }, orderBy: { createdAt: 'desc' } }),
    ]);
    const result = buildOrderList({ requests, publications: withCoverFallback(publications.map(mapPublication)), countLines: count?.lines || [], subscriptions, shipments });
    return Response.json(mapped({ ...result, hasInventoryCount: Boolean(count) }));
  } catch (error) {
    return fail(error);
  }
}
