import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderList, standingOrders } from './literatureOrders.mjs';

const publications = [
  { id: 1, code: 'gwt2', name: '書', category: 'book', language: 'CHT' },
  { id: 2, code: 'rk', name: '書二', category: 'book', language: 'ENG' },
  { id: 3, code: 'es', name: '書三', category: 'book', language: 'JPN' },
];
const request = (id, publicationId, quantity, status = 'pending') => ({ id, publicationId, quantity, status, person: { name: '甲' } });
const make = (overrides = {}) => buildOrderList({ requests: [], publications, counts: [], subscriptions: [], shipments: [], deliveries: [], people: [], ...overrides });

test('subtracts stock and quantities promised to received requests', () => {
  const result = make({
    requests: [request(1, 1, 5), request(2, 1, 1, 'received')],
    counts: [{ source: 'manual', status: 'done', month: '2026-10', lines: [{ publicationId: 1, onHand: 3, updatedAt: '2026-10-01T00:00:00Z' }] }],
  });
  assert.equal(result.toOrder[0].stock, 2);
  assert.equal(result.toOrder[0].order, 3);
  assert.equal(result.toOrder[0].requests[0].personName, '甲');
});

test('fully covered requests come from stock and language codes use Hub suffixes', () => {
  const result = make({
    requests: [request(1, 1, 2), request(2, 2, 1), request(3, 3, 1)],
    counts: [{ source: 'manual', status: 'done', month: '2026-10', lines: [{ publicationId: 1, onHand: 2, updatedAt: '2026-10-01T00:00:00Z' }] }],
  });
  assert.equal(result.fromStock[0].hubCode, 'gwt2-CH');
  assert.deepEqual(result.toOrder.map((row) => row.hubCode).sort(), ['es-J', 'rk-E']);
});

test('standing orders include only changed totals', () => {
  const subscriptions = [
    { active: true, series: 'w', language: 'CHT', quantity: 6 },
    { active: true, series: 'mwb', language: 'CHT', quantity: 2 },
  ];
  const shipments = [{ lines: [
    { publicationId: 10, quantity: 5, publication: { code: 'w26.11', issue: '2026-11', language: 'CHT' } },
    { publicationId: 11, quantity: 2, publication: { code: 'mwb26.11', issue: '2026-11', language: 'CHT' } },
  ] }];
  assert.deepEqual(standingOrders({ subscriptions, shipments }), [{
    series: 'w',
    language: 'CHT',
    label: '守望台研讀版中文',
    now: 6,
    last: 5,
    diff: 1,
  }]);
});

test('standing orders use only the newest issue in a shipment', () => {
  const subscriptions = [{ active: true, series: 'w', language: 'CHT', quantity: 10 }];
  const shipments = [{
    lines: [
      { publicationId: 1, quantity: 6, publication: { code: 'w26.12', language: 'CHT' } },
      { publicationId: 2, quantity: 6, publication: { code: 'w27.01', language: 'CHT' } },
    ],
  }];
  assert.equal(standingOrders({ subscriptions, shipments })[0].last, 6);
});

test('standing orders sum the newest publication across shipments', () => {
  const subscriptions = [{ active: true, series: 'w', language: 'CHT', quantity: 10 }];
  const publication = { code: 'w27.01', language: 'CHT' };
  const shipments = [
    { lines: [{ publicationId: 2, quantity: 3, publication }] },
    { lines: [
      { publicationId: 1, quantity: 6, publication: { code: 'w26.12', language: 'CHT' } },
      { publicationId: 2, quantity: 2, publication },
    ] },
  ];
  assert.equal(standingOrders({ subscriptions, shipments })[0].last, 5);
});

const reportCount = { source: 'jwhub-report', status: 'done', month: '2026-10', lines: [{ publicationId: 1, onHand: 0 }] };
const shipment = (quantity, date = '2026-10-15T00:00:00Z') => ({
  id: 10, shippedAt: date, lines: [{ shipmentId: 10, publicationId: 1, quantity, publication: publications[0] }],
});

test('opening report includes subsequent shipment remainder', () => {
  const result = make({ requests: [request(1, 1, 1200)], counts: [reportCount], shipments: [shipment(1200)] });
  assert.equal(result.fromStock[0].stock, 1200);
  assert.equal(result.fromStock[0].stockDetail.fromShipments, 1200);
});

test('done count excludes earlier shipments and includes later shipments', () => {
  const result = make({
    requests: [request(1, 1, 5)],
    counts: [{ source: 'manual', status: 'done', month: '2026-11', lines: [{ publicationId: 1, onHand: 2, updatedAt: '2026-12-20T00:00:00Z' }] }],
    shipments: [shipment(100, '2026-11-05T00:00:00Z'), shipment(2, '2026-12-12T00:00:00Z')],
  });
  assert.equal(result.toOrder[0].stock, 4);
});

test('shipment adds only the remainder after subscriber allocation', () => {
  const pub = { id: 1, code: 'w26.10', language: 'CHT', category: 'magazine' };
  const result = make({
    publications: [pub], requests: [request(1, 1, 8)], counts: [reportCount],
    shipments: [{ ...shipment(10), lines: [{ shipmentId: 10, publicationId: 1, quantity: 10, publication: pub }] }],
    subscriptions: [{ active: true, personId: 2, series: 'w', language: 'CHT', quantity: 3 }],
    people: [{ id: 2, name: '乙' }],
  });
  assert.equal(result.toOrder[0].stock, 7);
});

test('stock deliveries and unallocated received requests reduce available stock', () => {
  const result = make({
    requests: [request(1, 1, 8), request(2, 1, 2, 'received')],
    counts: [{ source: 'manual', status: 'done', month: '2026-10', lines: [{ publicationId: 1, onHand: 10, updatedAt: '2026-10-01T00:00:00Z' }] }],
    deliveries: [{ publicationId: 1, shipmentId: null, quantity: 3, deliveredAt: '2026-11-12T00:00:00Z' }],
  });
  assert.equal(result.toOrder[0].stock, 5);
});

test('received requests allocated to a counted shipment are not subtracted twice', () => {
  const received = { ...request(2, 1, 3, 'received'), personId: 2 };
  const result = make({ requests: [request(1, 1, 8), received], counts: [reportCount],
    shipments: [shipment(10)], people: [{ id: 2, name: '乙' }] });
  assert.equal(result.toOrder[0].stock, 7);
});

test('stock follows the count coverage instant for completed and draft counts', () => {
  const count = (status, completedAt = null) => ({
    status,
    completedAt,
    month: '2026-12',
    lines: [{ publicationId: 1, onHand: 2 }],
  });
  const stock = (entry, shipments) => {
    const result = make({ requests: [request(1, 1, 100)], counts: [entry], shipments });
    return result.toOrder[0].stock;
  };
  assert.equal(stock(count('done', '2026-12-08T00:00:00Z'), [shipment(3, '2026-12-20T00:00:00Z')]), 5);
  assert.equal(stock({ ...count('done'), source: 'jwhub-report', month: '2026-10' }, [
    shipment(100, '2026-10-05T00:00:00Z'),
    shipment(3, '2026-10-15T00:00:00Z'),
  ]), 5);
  assert.equal(stock(count('draft'), [shipment(3, '2026-10-15T00:00:00Z')]), 2);
});
