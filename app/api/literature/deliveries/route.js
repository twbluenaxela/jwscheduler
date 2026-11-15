export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../lib/db';
import { auth, fail, id, quantity, mapped, scoped, invalid } from '../../../lib/literatureApi';

export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const shipmentId = id(new URL(request.url).searchParams.get('shipmentId'));
    await scoped('shipment', shipmentId, congregationId);
    const deliveries = await db.literatureDelivery.findMany({ where: { congregationId, shipmentId } });
    return NextResponse.json({ deliveries: mapped(deliveries) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request) {
  try {
    const congregationId = await auth(request);
    const body = await request.json();
    const batch = Array.isArray(body.items);
    const items = batch ? body.items : [body];
    if (!items.length || items.length > 50) invalid('一次最多發放 50 項');
    const validated = items.map(item => ({
      congregationId,
      personId: id(item.personId),
      publicationId: id(item.publicationId),
      shipmentId: item.shipmentId == null ? null : id(item.shipmentId),
      requestId: item.requestId == null ? null : id(item.requestId),
      quantity: quantity(item.quantity),
    }));
    const idsFor = key => [...new Set(validated.map(item => item[key]).filter(Boolean))];
    const [people, publications, shipments, requests] = await Promise.all([
      db.person.findMany({ where: { congregationId, id: { in: idsFor('personId') } } }),
      db.publication.findMany({ where: { congregationId, id: { in: idsFor('publicationId') } } }),
      db.shipment.findMany({ where: { congregationId, id: { in: idsFor('shipmentId') } } }),
      db.literatureRequest.findMany({ where: { congregationId, id: { in: idsFor('requestId') } } }),
    ]);
    const peopleIds = new Set(people.map(person => person.id));
    const publicationIds = new Set(publications.map(publication => publication.id));
    const shipmentIds = new Set(shipments.map(shipment => shipment.id));
    const requestsById = new Map(requests.map(item => [item.id, item]));
    for (const item of validated) {
      if (!peopleIds.has(item.personId) || !publicationIds.has(item.publicationId) ||
          (item.shipmentId && !shipmentIds.has(item.shipmentId)) ||
          (item.requestId && !requestsById.has(item.requestId))) {
        throw Object.assign(new Error('找不到資料'), { status: 404 });
      }
      const requestItem = requestsById.get(item.requestId);
      if (requestItem && (requestItem.personId !== item.personId ||
          requestItem.publicationId !== item.publicationId || requestItem.status === 'cancelled')) {
        invalid('申請與發放資料不符');
      }
    }
    const deliveries = await db.$transaction(async tx => {
      const results = [];
      for (const item of validated) {
        const result = await tx.literatureDelivery.create({ data: item });
        if (item.requestId) {
          await tx.literatureRequest.update({
            where: { id: item.requestId },
            data: { status: 'delivered', deliveredAt: result.deliveredAt },
          });
        }
        results.push(result);
      }
      return results;
    }, { timeout: 60000, maxWait: 10000 });
    return NextResponse.json(batch
      ? { deliveries: mapped(deliveries) }
      : { delivery: mapped(deliveries[0]) });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request) {
  try {
    const congregationId = await auth(request);
    const raw = new URL(request.url).searchParams.get('ids');
    if (!raw) invalid();
    const ids = [...new Set(raw.split(',').map(id))];
    if (ids.length > 50) invalid('一次最多取消 50 項');
    await db.$transaction(async tx => {
      const deliveries = await tx.literatureDelivery.findMany({
        where: { congregationId, id: { in: ids } },
      });
      if (deliveries.length !== ids.length) invalid('找不到發放紀錄');
      await tx.literatureDelivery.deleteMany({ where: { congregationId, id: { in: ids } } });
      const requestIds = new Set(deliveries.map(delivery => delivery.requestId).filter(Boolean));
      for (const requestId of requestIds) {
        const remaining = await tx.literatureDelivery.count({ where: { congregationId, requestId } });
        if (!remaining) {
          await tx.literatureRequest.updateMany({
            where: { id: requestId, congregationId, status: 'delivered' },
            data: { status: 'received', deliveredAt: null },
          });
        }
      }
    }, { timeout: 60000, maxWait: 10000 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
