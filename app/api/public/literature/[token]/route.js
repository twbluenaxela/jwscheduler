export const dynamic = 'force-dynamic';
import db from '../../../../lib/db';
import { publicCongregation, publicJson, disabled } from '../../../../lib/publicLiteratureApi';
import { groupPeople, publicCatalog } from '../../../../lib/publicForm.mjs';
import { stockAvailableByPublication } from '../../../../lib/literatureOrders.mjs';

export async function GET(request, context) {
  const congregation = await publicCongregation(context);
  if (!congregation) return disabled();
  const [people, publications, counts, subscriptions, shipments, deliveries, requests] = await Promise.all([
    db.person.findMany({ where: { congregationId: congregation.id } }),
    db.publication.findMany({ where: { congregationId: congregation.id } }),
    db.inventoryCount.findMany({ where: { congregationId: congregation.id }, include: { lines: true } }),
    db.literatureSubscription.findMany({ where: { congregationId: congregation.id } }),
    db.shipment.findMany({ where: { congregationId: congregation.id }, include: { lines: { include: { publication: true } } }, orderBy: { createdAt: 'desc' } }),
    db.literatureDelivery.findMany({ where: { congregationId: congregation.id } }),
    db.literatureRequest.findMany({ where: { congregationId: congregation.id } }),
  ]);
  const available = stockAvailableByPublication({ publications, counts, subscriptions, shipments, requests, deliveries, people });
  const inStock = new Set([...available].filter(([, quantity]) => quantity > 0).map(([id]) => id));
  return publicJson({ congregation: { name: congregation.name }, groups: groupPeople(people), publications: publicCatalog(publications, { inStock }) });
}
