import db from './db';
import { buildCountLines, missingReceivedLines, receivedByPublication } from './literatureInventory.mjs';
import { invalid, scoped } from './literatureApi';

export function validateMonth(month) {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) invalid('月份無效');
  return month;
}
export function nonnegative(value) {
  if (!Number.isInteger(value) || value < 0 || value > 2147483647) invalid('數量無效');
  return value;
}
export async function countData(congregationId, month) {
  const [publications, previous, shipments] = await Promise.all([
    db.publication.findMany({ where: { congregationId } }),
    db.inventoryCount.findFirst({ where: { congregationId, month: { lt: month } }, orderBy: { month: 'desc' }, include: { lines: true } }),
    db.shipment.findMany({ where: { congregationId }, include: { lines: true } }),
  ]);
  const received = receivedByPublication(shipments, month);
  return { publications, previousLines: previous?.lines || [], received,
    lines: buildCountLines({ publications, previousLines: previous?.lines || [], received }) };
}
export async function getCount(id, congregationId) {
  return scoped('inventoryCount', id, congregationId);
}
export async function refreshLines(count) {
  let lines = await db.inventoryLine.findMany({ where: { countId: count.id } });
  if (count.status !== 'draft') return lines;
  const [shipments, previous] = await Promise.all([
    db.shipment.findMany({
      where: { congregationId: count.congregationId },
      include: { lines: true },
    }),
    db.inventoryCount.findFirst({
      where: { congregationId: count.congregationId, month: { lt: count.month } },
      orderBy: { month: 'desc' },
      include: { lines: true },
    }),
  ]);
  const received = receivedByPublication(shipments, count.month);
  const missing = missingReceivedLines({ lines, previousLines: previous?.lines || [], received });
  if (missing.length) {
    await db.inventoryLine.createMany({
      data: missing.map((line) => ({ ...line, countId: count.id })),
      skipDuplicates: true,
    });
    lines = await db.inventoryLine.findMany({ where: { countId: count.id } });
  }
  return Promise.all(lines.map((line) => {
    const quantity = received.get(line.publicationId) || 0;
    return line.received === quantity
      ? line
      : db.inventoryLine.update({ where: { id: line.id }, data: { received: quantity } });
  }));
}
