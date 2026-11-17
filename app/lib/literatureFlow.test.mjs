import test from 'node:test';
import assert from 'node:assert/strict';
import { validateSubmission, flagSubmission } from './publicForm.mjs';
import {
  parsePackingSlip, matchShipmentLines, allocateShipment, pendingHandouts, handoutSummary,
} from './literatureShipments.mjs';
import { buildOrderList, standingOrders } from './literatureOrders.mjs';
import {
  countCoveredUntil, receivedBetween, buildCountLines, missingReceivedLines,
  expected, distributed, isCountable, parseHubInventoryReport,
} from './literatureInventory.mjs';

const publications = [
  { id: 1, code: 'T-dth', name: '傳單', category: 'toolbox' },
  // This congregation explicitly counts this book, which is excluded by default.
  { id: 2, code: 'gwt1', name: '書籍', category: 'book', countable: true },
  { id: 3, code: 'es27', name: '天天考查', category: 'book' },
  { id: 4, code: 'wp23.1', name: '公眾版', category: 'magazine' },
  { id: 5, code: 'w', name: '研讀版', category: 'study' },
  { id: 6, code: 'w27.01', name: '研讀版 1月', category: 'study' },
  { id: 7, code: 'nwtls', name: '大字聖經', category: 'bible' },
].map(p => ({ language: 'CHT', format: 'standard', active: true, ...p }));
const people = [
  { id: 1, name: '甲', serviceGroup: 'A' },
  { id: 2, name: '乙', serviceGroup: 'B' },
  { id: 3, name: '丙', serviceGroup: 'C' },
];
const pub = code => publications.find(p => p.code === code);
const byCode = (rows, code) => rows.find(row => row.publication.code === code);
const shipments = [];
const requests = [];
const subscriptions = [];
const deliveries = [];
const counts = [];
const orderList = (extraRequests = []) => buildOrderList({
  requests: [...requests, ...extraRequests], publications, counts, subscriptions,
  shipments, deliveries, people,
});
// A later member's pending request makes stock visible on the order screen.
const stockFor = code => {
  const probe = { id: 900, personId: 3, publicationId: pub(code).id, quantity: 1,
    status: 'pending', createdAt: '2026-12-31T00:00:00Z' };
  const result = orderList([probe]);
  return byCode([...result.toOrder, ...result.fromStock], code).stock;
};
const allocate = shipment => allocateShipment({
  lines: shipment.lines, publications, subscriptions, requests, deliveries, people,
  shippedAt: shipment.shippedAt,
});
const handouts = () => pendingHandouts({
  shipments, allocations: new Map(shipments.map(s => [s.id, allocate(s)])),
  deliveries, requests, people,
});
const slip = (id, text) => {
  const parsed = parsePackingSlip(text);
  const lines = matchShipmentLines(parsed.lines, publications).map(line => ({
    ...line, shipmentId: id, publication: publications.find(p => p.id === line.publicationId),
  }));
  assert.ok(lines.every(line => line.action === 'match'));
  return { id, shippedAt: parsed.shippedAt, lines };
};

test('1. 十月：匯入 JW Hub opening report', () => {
  const report = parseHubInventoryReport(`2026年10月 | 中文
傳單
(T-dth) 傳單 0
書籍
(gwt1) 書籍 0
(es27) 天天考查 0
公眾版雜誌
(wp23.1) 公眾版 9`);
  assert.equal(report.month, '2026-10');
  assert.equal(report.language, 'CHT');
  assert.deepEqual(report.items.map(item => [item.code, item.quantity]), [
    ['T-dth', 0], ['gwt1', 0], ['es27', 0], ['wp23.1', 9],
  ]);
  counts.push({ month: report.month, source: 'jwhub-report', status: 'done',
    lines: report.items.map(item => ({ publicationId: pub(item.code).id, onHand: item.quantity })) });
  assert.equal(countCoveredUntil(counts[0]).toISOString(), '2026-10-10T15:59:59.999Z');
});

test('2. 十一月十六日：public form creates requests and a subscription', () => {
  const a = validateSubmission({ people, publications, body: { personId: 1, items: [
    { publicationId: 2, quantity: 4, kind: 'once' },
    { publicationId: 3, quantity: 1, kind: 'once' },
  ] } });
  const b = validateSubmission({ people, publications, body: { personId: 2, items: [
    { publicationId: 5, quantity: 1, kind: 'standing' },
  ] } });
  assert.deepEqual(a, { personId: 1, guestName: null, guestNote: null, note: null,
    items: [{ publicationId: 2, quantity: 4, kind: 'once' },
      { publicationId: 3, quantity: 1, kind: 'once' }] });
  assert.deepEqual(b.items, [{ publicationId: 5, quantity: 1, kind: 'standing' }]);
  assert.equal(b.personId, 2);
  assert.deepEqual(flagSubmission({ items: a.items }), { flagged: false, reason: null });
  assert.deepEqual(flagSubmission({ items: [{ ...a.items[0], quantity: 6 }] }),
    { flagged: true, reason: '數量超過 5' });
  assert.deepEqual(flagSubmission({ items: [{ ...b.items[0], series: 'w', language: 'CHT' }] }),
    { flagged: false, reason: null });
  // The submit route stores once items as requests and standing items as subscriptions.
  a.items.forEach((item, index) => requests.push({ id: index + 1, personId: a.personId,
    publicationId: item.publicationId, publication: publications.find(p => p.id === item.publicationId),
    quantity: item.quantity, status: 'pending', source: 'form', createdAt: '2026-11-16T00:00:00Z' }));
  subscriptions.push({ personId: b.personId, series: 'w', language: 'CHT',
    quantity: b.items[0].quantity, active: true });
});

test('3. 訂購清單：no stock before the shipment', () => {
  const result = orderList();
  assert.deepEqual(result.toOrder.map(row => [row.publication.code, row.need, row.stock, row.order]).sort(),
    [['es27', 1, 0, 1], ['gwt1', 4, 0, 4]]);
  assert.deepEqual(result.fromStock, []);
});

test('4. 舊裝箱單：October shipment predates the requests', () => {
  const old = slip(10, `裝箱單 1001
2026年10月15日
T-dth-CH | 傳單
傳單
已發送的數量
1200
gwt1-CH | 書籍
書籍
已發送的數量
20
es27-CH | 天天考查
天天考查
已發送的數量
20`);
  shipments.push(old);
  assert.deepEqual(allocate(old).map(row => [row.publication.code, row.allocated, row.remainder]),
    [['T-dth', 0, 1200], ['gwt1', 0, 20], ['es27', 0, 20]]);
  const result = orderList();
  assert.deepEqual(result.toOrder, []);
  assert.deepEqual(result.fromStock.map(row => [row.publication.code, row.need, row.stock]).sort(),
    [['es27', 1, 20], ['gwt1', 4, 20]]);
});

test('5. 標為已到：stock is promised once and shown for handout', () => {
  requests.forEach(request => { request.status = 'received'; });
  const roster = handouts();
  assert.deepEqual(roster.map(person => person.personId), [1]);
  assert.deepEqual(roster[0].items.map(item => [item.code, item.quantity, item.requestId]).sort(),
    [['es27', 1, 2], ['gwt1', 4, 1]]);
  assert.equal(handoutSummary(roster[0].items), '書籍 ×4 · 天天考查');
  assert.deepEqual(orderList().toOrder, []);
  assert.deepEqual(orderList().fromStock, []);
  assert.equal(stockFor('gwt1'), 16);
});

test('6. 發放：delivery replaces the promise without subtracting twice', () => {
  requests.forEach(request => {
    deliveries.push({ personId: request.personId, publicationId: request.publicationId,
      requestId: request.id, shipmentId: null, quantity: request.quantity,
      deliveredAt: '2026-11-18T00:00:00Z' });
    request.status = 'delivered';
  });
  assert.deepEqual(handouts(), []);
  assert.equal(stockFor('gwt1'), 16);
});

test('7. 新裝箱單：allocate the January study issue to subscriber B', () => {
  const latest = slip(11, `裝箱單 1002
2026年11月25日
w27.01-CH | 研讀版
研讀版
已發送的數量
12`);
  shipments.push(latest);
  const [allocation] = allocate(latest);
  assert.deepEqual(allocation.recipients.map(r => [r.personId, r.source, r.quantity]), [[2, 'subscription', 1]]);
  assert.equal(allocation.remainder, 11);
  assert.deepEqual(standingOrders({ subscriptions, shipments }), [{ series: 'w', language: 'CHT',
    label: '守望台研讀版中文', now: 1, last: 12, diff: -11 }]);
  assert.deepEqual(handouts().map(person => [person.personId, person.items[0].code]), [[2, 'w27.01']]);
});

test('8. 十一月清點：both slips feed opening, receipts and distribution', () => {
  const draft = { month: '2026-11', status: 'draft' };
  const received = receivedBetween(shipments, countCoveredUntil(counts[0]),
    countCoveredUntil(draft, new Date('2026-11-30T12:00:00Z')));
  assert.deepEqual([...received.entries()], [[1, 1200], [2, 20], [3, 20], [6, 12]]);
  const lines = buildCountLines({ publications, previousLines: counts[0].lines, received });
  const tract = lines.find(line => line.publicationId === 1);
  const book = lines.find(line => line.publicationId === 2);
  assert.equal(expected(tract), 1200);
  assert.deepEqual([book.opening, book.received, expected(book)], [0, 20, 20]);
  assert.equal(lines.find(line => line.publicationId === 4).opening, 9);
  assert.equal(isCountable(pub('w27.01')), false);
  assert.equal(isCountable(pub('nwtls')), false);
  assert.equal(lines.some(line => [6, 7].includes(line.publicationId)), false);
  assert.deepEqual(missingReceivedLines({ lines: [], previousLines: counts[0].lines,
    received: new Map([[6, 12], [7, 3]]), publications }), []);
  book.onHand = 16;
  assert.equal(distributed(book), 4);
  draft.lines = lines;
  counts.push(draft);
});

test('9. 十二月：completed count becomes the next stock baseline', () => {
  const nov = counts[1];
  nov.status = 'done';
  nov.completedAt = '2026-11-30T12:00:00Z';
  shipments.push(slip(12, `裝箱單 1003
2026年12月3日
gwt1-CH | 書籍
書籍
已發送的數量
10`));
  const december = { month: '2026-12', status: 'draft' };
  const received = receivedBetween(shipments, countCoveredUntil(nov),
    countCoveredUntil(december, new Date('2026-12-31T00:00:00Z')));
  assert.deepEqual([...received.entries()], [[2, 10]]);
  const lines = buildCountLines({ publications, previousLines: nov.lines, received });
  const book = lines.find(line => line.publicationId === 2);
  assert.deepEqual([book.opening, book.received, expected(book)], [16, 10, 26]);
  assert.equal(stockFor('gwt1'), 26);
});
