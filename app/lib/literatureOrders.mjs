import { CATEGORY_ORDER } from './literature.mjs';
import { countCoverageStart } from './literatureInventory.mjs';
import { allocateShipment, issueOf, seriesOf } from './literatureShipments.mjs';

const seriesNames = { w: '守望台研讀版', wlp: '守望台研讀版（大字版）', mwb: '聚會手冊' };
const languageNames = { CHT: '中文', ENG: '英文', JPN: '日文' };

export function standingOrders({ subscriptions, shipments }) {
  const totals = new Map();
  for (const subscription of subscriptions) {
    if (!subscription.active || !seriesNames[subscription.series]) continue;
    const key = `${subscription.series}:${subscription.language}`;
    const row = totals.get(key) || { series: subscription.series, language: subscription.language, now: 0 };
    row.now += subscription.quantity;
    totals.set(key, row);
  }
  const latest = new Map();
  for (const shipment of shipments) {
    for (const line of shipment.lines || []) {
      const publication = line.publication;
      const series = seriesOf(publication?.code || '');
      if (!seriesNames[series]) continue;
      const key = `${series}:${publication.language}`;
      if (!totals.has(key)) totals.set(key, { series, language: publication.language, now: 0 });
      const issue = issueOf(publication.code) || publication.issue || '';
      const publicationId = String(line.publicationId ?? publication.id);
      const current = latest.get(key);
      if (!current || issue > current.issue) {
        latest.set(key, { issue, publicationId, quantity: line.quantity });
      } else if (publicationId === current.publicationId) {
        current.quantity += line.quantity;
      }
    }
  }
  return [...totals.entries()].map(([key, row]) => {
    const last = latest.get(key)?.quantity || 0;
    return {
      series: row.series,
      language: row.language,
      label: `${seriesNames[row.series]}${languageNames[row.language] || row.language}`,
      now: row.now,
      last,
      diff: row.now - last,
    };
  }).filter((row) => row.diff !== 0);
}

export function buildOrderList({ requests, publications, counts, subscriptions, shipments, deliveries, people }) {
  const pending = new Map();
  const promised = new Map();
  for (const request of requests) {
    const key = String(request.publicationId);
    if (request.status !== 'pending') continue;
    const row = pending.get(key) || { need: 0, requests: [] };
    row.need += request.quantity;
    row.requests.push({ requestId: request.id, personName: request.person?.name || request.personName || null, guestName: request.guestName || null, quantity: request.quantity });
    pending.set(key, row);
  }
  const stock = new Map();
  for (const count of counts) {
    for (const line of count.lines) {
      if (line.onHand == null) continue;
      const date = countCoverageStart(count);
      const key = String(line.publicationId);
      if (!stock.has(key) || date > stock.get(key).date ||
          (date.getTime() === stock.get(key).date.getTime() && count.month > stock.get(key).month)) {
        stock.set(key, { base: line.onHand, date, month: count.month, fromShipments: 0 });
      }
    }
  }
  const allocatedRequests = new Set();
  for (const shipment of shipments) {
    const shippedAt = shipment.shippedAt ?? shipment.createdAt;
    const allocations = allocateShipment({
      lines: shipment.lines || [], publications, subscriptions, requests, deliveries, people, shippedAt,
    });
    for (const allocation of allocations) {
      const key = String(allocation.line.publicationId);
      const detail = stock.get(key) || { base: 0, date: null, fromShipments: 0 };
      const date = new Date(shippedAt);
      if (detail.date && date < detail.date) continue;
      detail.fromShipments += allocation.remainder;
      stock.set(key, detail);
      for (const recipient of allocation.recipients) {
        if (recipient.requestId != null) allocatedRequests.add(String(recipient.requestId));
      }
    }
  }
  for (const request of requests) {
    if (request.status !== 'received' || allocatedRequests.has(String(request.id))) continue;
    const key = String(request.publicationId);
    promised.set(key, (promised.get(key) || 0) + request.quantity);
  }
  const handedOut = new Map();
  for (const delivery of deliveries) {
    if (delivery.shipmentId != null) continue;
    const key = String(delivery.publicationId);
    const detail = stock.get(key);
    const date = new Date(delivery.deliveredAt);
    if (detail?.date && date < detail.date) continue;
    handedOut.set(key, (handedOut.get(key) || 0) + delivery.quantity);
  }
  const toOrder = [];
  const fromStock = [];
  const sorted = publications.filter((item) => pending.has(String(item.id))).sort((a, b) => {
    const category = (item) => {
      const index = CATEGORY_ORDER.indexOf(item.category);
      return index < 0 ? CATEGORY_ORDER.length : index;
    };
    return category(a) - category(b) || a.code.localeCompare(b.code);
  });
  for (const publication of sorted) {
    const key = String(publication.id);
    const need = pending.get(key).need;
    const detail = stock.get(key) || { base: 0, date: null, fromShipments: 0 };
    const available = Math.max(0, detail.base + detail.fromShipments - (handedOut.get(key) || 0) - (promised.get(key) || 0));
    const suffix = { CHT: 'CH', ENG: 'E', JPN: 'J' }[publication.language];
    const row = { publication, hubCode: suffix ? `${publication.code}-${suffix}` : publication.code, need, stock: available, stockDetail: { base: detail.base, baseDate: detail.date, fromShipments: detail.fromShipments }, order: Math.max(0, need - available), requests: pending.get(key).requests };
    (row.order ? toOrder : fromStock).push(row);
  }
  return { toOrder, fromStock, standing: standingOrders({ subscriptions, shipments }) };
}
