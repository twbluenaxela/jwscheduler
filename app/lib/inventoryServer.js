import db from './db.js';
import { buildCountLines, missingReceivedLines, receivedByPublication } from './literatureInventory.mjs';
function invalid(message = '輸入資料無效') {
  throw Object.assign(new Error(message), { status: 400 });
}
function parseId(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) invalid();
  return Number(value);
}

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
  const count = await db.inventoryCount.findFirst({ where: { id: parseId(id), congregationId } });
  if (!count) throw Object.assign(new Error('找不到資料'), { status: 404 });
  return count;
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

export function matchHubReport(report, publications) {
  return report.items.map((item) => {
    const candidates = publications.filter((p) => p.code === item.code && p.language === report.language);
    const publication = candidates.find((p) => p.format === 'standard') || candidates[0];
    return { ...item, publicationId: publication?.id ?? null, action: publication ? 'match' : 'create' };
  });
}

export async function importHubReport(congregationId, report, { db: client = db } = {}) {
  return client.$transaction(async (tx) => {
    let count = await tx.inventoryCount.findUnique({
      where: { congregationId_month: { congregationId, month: report.month } },
    });
    if (count) {
      const claimed = await tx.inventoryCount.updateMany({
        where: { id: count.id, status: 'draft' },
        data: { status: 'done', source: 'jwhub-report' },
      });
      if (!claimed.count) throw Object.assign(new Error('此月份已完成清點'), { status: 409 });
    } else {
      count = await tx.inventoryCount.create({
        data: { congregationId, month: report.month, status: 'done', source: 'jwhub-report' },
      });
    }
    const [publications, previous, shipments] = await Promise.all([
      tx.publication.findMany({ where: { congregationId } }),
      tx.inventoryCount.findFirst({
        where: { congregationId, month: { lt: report.month } },
        orderBy: { month: 'desc' },
        include: { lines: true },
      }),
      tx.shipment.findMany({ where: { congregationId }, include: { lines: true } }),
    ]);
    const matched = matchHubReport(report, publications);
    const newPublications = matched.filter((row) => !row.publicationId).map((row) => ({
      congregationId,
      code: row.code,
      name: row.name,
      category: /^T-/i.test(row.code) ? 'toolbox' : /^(wp|g)\d/i.test(row.code) ? 'magazine' : 'other',
      language: report.language,
      format: 'standard',
      aliases: [],
      note: '由庫存報告自動新增',
    }));
    if (newPublications.length) {
      await tx.publication.createMany({ data: newPublications, skipDuplicates: true });
      publications.push(...await tx.publication.findMany({
        where: { congregationId, language: report.language, code: { in: newPublications.map((p) => p.code) } },
      }));
    }
    const rows = matchHubReport(report, publications);
    const previousLines = previous?.lines || [];
    const received = receivedByPublication(shipments, report.month);
    const defaultLines = buildCountLines({ publications, previousLines, received });
    const previousById = new Map(previousLines.map((line) => [line.publicationId, line.onHand ?? 0]));
    const reportLines = rows.map((row) => ({
      publicationId: row.publicationId,
      opening: previousById.get(row.publicationId) ?? 0,
      received: received.get(row.publicationId) ?? 0,
      onHand: row.quantity,
    }));
    await tx.inventoryLine.createMany({
      data: [...defaultLines.map((line) => ({ ...line, onHand: 0 })), ...reportLines]
        .map((line) => ({ ...line, countId: count.id })),
      skipDuplicates: true,
    });
    await tx.inventoryLine.updateMany({
      where: { countId: count.id, publicationId: { in: defaultLines.map((line) => line.publicationId) } },
      data: { onHand: 0 },
    });
    const updates = new Map();
    for (const line of reportLines) {
      const key = JSON.stringify([line.opening, line.received, line.onHand]);
      if (!updates.has(key)) updates.set(key, []);
      updates.get(key).push(line.publicationId);
    }
    for (const [key, ids] of updates) {
      const [opening, quantityReceived, onHand] = JSON.parse(key);
      await tx.inventoryLine.updateMany({
        where: { countId: count.id, publicationId: { in: ids } },
        data: { opening, received: quantityReceived, onHand },
      });
    }
    return tx.inventoryCount.findUnique({ where: { id: count.id } });
  }, { timeout: 60000, maxWait: 10000 });
}
