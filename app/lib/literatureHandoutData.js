import db from './db';
import { allocateShipment } from './literatureShipments.mjs';

export async function loadHandoutData(congregationId) {
  const since = new Date(Date.now() - 60 * 86400000);
  const [shipments, publications, subscriptions, requests, deliveries, people] = await Promise.all([
    db.shipment.findMany({
      where: {
        congregationId,
        OR: [
          { shippedAt: { gte: since } },
          { shippedAt: null, createdAt: { gte: since } },
        ],
      },
      include: { lines: true },
    }),
    db.publication.findMany({ where: { congregationId } }),
    db.literatureSubscription.findMany({ where: { congregationId } }),
    db.literatureRequest.findMany({ where: { congregationId }, include: { publication: true } }),
    db.literatureDelivery.findMany({ where: { congregationId } }),
    db.person.findMany({ where: { congregationId } }),
  ]);
  shipments.sort((a, b) =>
    new Date(b.shippedAt || b.createdAt) - new Date(a.shippedAt || a.createdAt));
  const allocations = new Map(shipments.map(shipment => [
    shipment.id,
    allocateShipment({ lines: shipment.lines, shippedAt: shipment.shippedAt ?? shipment.createdAt, publications, subscriptions, requests, deliveries, people }),
  ]));
  return { shipments, publications, subscriptions, requests, deliveries, people, allocations };
}
