import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderList, standingOrders } from './literatureOrders.mjs';

const publications = [
  { id: 1, code: 'gwt2', name: '書', category: 'book', language: 'CHT' },
  { id: 2, code: 'rk', name: '書二', category: 'book', language: 'ENG' },
  { id: 3, code: 'es', name: '書三', category: 'book', language: 'JPN' },
];
const request = (id, publicationId, quantity, status = 'pending') => ({ id, publicationId, quantity, status, person: { name: '甲' } });
const make = (overrides = {}) => buildOrderList({ requests: [], publications, countLines: [], subscriptions: [], shipments: [], ...overrides });

test('subtracts stock and quantities promised to received requests', () => {
  const result = make({
    requests: [request(1, 1, 5), request(2, 1, 1, 'received')],
    countLines: [{ publicationId: 1, opening: 2, received: 1, onHand: null }],
  });
  assert.equal(result.toOrder[0].stock, 2);
  assert.equal(result.toOrder[0].order, 3);
  assert.equal(result.toOrder[0].requests[0].personName, '甲');
});

test('fully covered requests come from stock and language codes use Hub suffixes', () => {
  const result = make({
    requests: [request(1, 1, 2), request(2, 2, 1), request(3, 3, 1)],
    countLines: [{ publicationId: 1, opening: 0, received: 0, onHand: 2 }],
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
