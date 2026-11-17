import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seriesOf, issueOf, hubLanguage, splitHubCode, parsePackingSlip, matchShipmentLines, allocateShipment, pendingRecipientCount } from './literatureShipments.mjs';

test('periodical codes and Hub languages', () => {
  assert.equal(seriesOf('wlp27.02'), 'wlp');
  assert.equal(seriesOf('w27.03'), 'w');
  assert.equal(seriesOf('nwt'), null);
  assert.equal(issueOf('mwb27.03'), '2027-03');
  assert.equal(issueOf('wp21.1'), '2021-n1');
  assert.equal(hubLanguage('J'), 'JPN');
  assert.equal(hubLanguage('XX'), 'other');
  assert.deepEqual(splitHubCode('dpa-CH Tw'), { code: 'dpa', language: 'CHT' });
  assert.deepEqual(splitHubCode('S-24-CH'), { code: 'S-24', language: 'CHT' });
  assert.deepEqual(splitHubCode('T-ftr-CH'), { code: 'T-ftr', language: 'CHT' });
});
test('parses real packing slip fixtures', () => {
  for (const [number, date, count] of [['3801436', '2026-11-05', 10], ['3791775', '2026-10-15', 15]]) {
    const text = readFileSync(new URL(`./test-fixtures/slip-${number}.txt`, import.meta.url), 'utf8');
    const result = parsePackingSlip(text);
    assert.equal(result.slipNumber, number);
    assert.equal(result.shippedAt, date);
    assert.equal(result.lines.length, count);
    assert.ok(result.lines.some(line => line.code.startsWith('wlp') && line.largePrint && line.quantity === 8));
  }
  assert.throws(() => parsePackingSlip('裝箱單123'), /品項/);
  assert.throws(() => parsePackingSlip(''), /號碼/);
});
test('matches variants and constructs missing publications', () => {
  const line = { code: 'w27.01', language: 'CHT', title: '守望台', largePrint: false };
  const matches = matchShipmentLines([line, { ...line, code: 'wlp27.01', largePrint: true }], [{ id: 2, code: 'w27.01', language: 'CHT', format: 'standard' }]);
  assert.equal(matches[0].publicationId, 2);
  assert.equal(matches[1].createData.format, 'large');
  assert.equal(matches[1].createData.issue, '2027-01');
});
test('allocates requests before subscriptions and records shortages and deliveries', () => {
  const result = allocateShipment({ lines: [{ publicationId: 1, shipmentId: 9, quantity: 2 }], publications: [{ id: 1, code: 'w27.01', language: 'CHT' }], people: [{ id: 1, name: '甲', serviceGroup: 'B' }, { id: 2, name: '乙', serviceGroup: 'A' }, { id: 3, status: 'inactive' }], requests: [{ id: 7, personId: 1, publicationId: 1, quantity: 2, status: 'ordered' }], subscriptions: [{ personId: 2, series: 'w', language: 'CHT', quantity: 1, active: true }, { personId: 3, series: 'w', language: 'CHT', quantity: 1, active: true }], deliveries: [{ personId: 1, publicationId: 1, shipmentId: 9, requestId: 7, quantity: 2 }] })[0];
  assert.equal(result.recipients[0].source, 'request');
  assert.equal(result.recipients[0].deliveredQuantity, 2);
  assert.equal(result.recipients[1].short, true);
  assert.equal(result.allocated, 3);
  assert.equal(result.remainder, 0);
});

test('allocates open requests by Taipei shipment date while preserving delivered requests', () => {
  const data = {
    lines: [{ publicationId: 1, shipmentId: 9, quantity: 10 }],
    publications: [{ id: 1, code: 'w27.01', language: 'CHT' }],
    people: Array.from({ length: 6 }, (_, index) => ({ id: index + 1, name: String(index + 1) })),
    requests: [
      { id: 1, personId: 1, publicationId: 1, quantity: 1, status: 'pending', createdAt: '2026-11-16T00:00:00Z' },
      { id: 2, personId: 2, publicationId: 1, quantity: 1, status: 'ordered', createdAt: '2026-10-10T00:00:00Z' },
      { id: 3, personId: 3, publicationId: 1, quantity: 1, status: 'received', createdAt: '2026-10-15T15:59:59Z' },
      { id: 4, personId: 4, publicationId: 1, quantity: 1, status: 'delivered', createdAt: '2026-11-16T00:00:00Z' },
      { id: 5, personId: 5, publicationId: 1, quantity: 1, status: 'pending' },
      { id: 6, personId: 6, publicationId: 1, quantity: 1, status: 'pending', createdAt: '2026-10-15T16:00:00Z' },
    ],
    subscriptions: [],
    deliveries: [{ personId: 4, publicationId: 1, shipmentId: 9, requestId: 4, quantity: 1 }],
  };
  const recipientIds = shippedAt => allocateShipment({ ...data, shippedAt })[0].recipients.map(r => r.requestId);
  assert.deepEqual(recipientIds(new Date('2026-10-15T00:00:00Z')), [2, 3, 4, 5]);
  assert.deepEqual(recipientIds('2026-10-15'), [2, 3, 4, 5]);
  assert.deepEqual(recipientIds(null), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(allocateShipment(data)[0].recipients.map(r => r.requestId), [1, 2, 3, 4, 5, 6]);
});

test('counts distinct people with an undelivered recipient entry', () => {
  const allocation = [
    { publication: { id: 10 }, recipients: [{ personId: 1 }, { personId: '1', requestId: 5 }, { personId: 2 }] },
    { publication: { id: '11' }, recipients: [{ personId: 2 }, { personId: 3, requestId: 8 }] },
  ];
  const deliveries = [
    { personId: '1', publicationId: '10', requestId: null },
    { personId: 2, publicationId: 10, requestId: 99 },
    { personId: '3', publicationId: 11, requestId: '8' },
  ];
  assert.equal(pendingRecipientCount(allocation, deliveries), 2);
  assert.equal(pendingRecipientCount([], deliveries), 0);
  assert.equal(pendingRecipientCount(allocation, [...deliveries,
    { personId: 1, publicationId: 10, requestId: '5' },
    { personId: '2', publicationId: '10' },
    { personId: 2, publicationId: 11 },
  ]), 0);
});

test('pendingHandouts groups and sorts undelivered recipients and received requests', async () => {
  const { pendingHandouts } = await import('./literatureShipments.mjs');
  const publication = { id: 1, code: 'w26.1', name: '研讀版', language: 'CHT', format: 'standard' };
  const booklet = { id: 2, code: 'mwb26.3', name: '手冊', language: 'ENG', format: 'standard' };
  const people = [{ id: 1, name: '王小明', serviceGroup: 'B' }, { id: 2, name: '張子婷', serviceGroup: 'A' }];
  const allocations = new Map([[10, [{ publication, recipients: [{ personId: 1, quantity: 1, source: 'subscription' }, { personId: 2, quantity: 1, source: 'request', requestId: 4 }] }]]]);
  const result = pendingHandouts({ shipments: [{ id: 10 }], allocations, people, deliveries: [{ personId: 1, publicationId: 1, requestId: null }], requests: [{ id: 4, personId: 2, publicationId: 1, status: 'received', publication }, { id: 5, personId: 1, publicationId: 2, quantity: 2, status: 'received', publication: booklet }] });
  assert.deepEqual(result.map(p => p.personId), [2, 1]);
  assert.equal(result[0].items.length, 1);
  assert.equal(result[0].items[0].label, '研讀版 1月');
  assert.equal(result[1].items[0].label, '手冊 英 3月');
  assert.equal(result[1].items[0].shipmentId, null);
});

test('pendingHandouts lists a request allocated to two shipments only once', async () => {
  const { pendingHandouts } = await import('./literatureShipments.mjs');
  const publication = { id: 1, code: 'nwtls', name: '聖經', language: 'CHT', format: 'standard' };
  const recipient = { personId: 1, requestId: 30, quantity: 1, source: 'request' };
  const allocations = new Map([
    [10, [{ publication, recipients: [recipient] }]],
    [11, [{ publication, recipients: [{ ...recipient, requestId: '30' }] }]],
  ]);
  const data = {
    shipments: [{ id: 10 }, { id: 11 }],
    allocations,
    deliveries: [],
    requests: [{ id: 30, personId: 1, publicationId: 1, status: 'received', publication }],
    people: [{ id: 1, name: '王小明' }],
  };

  const result = pendingHandouts(data);
  assert.equal(result.length, 1);
  assert.equal(result[0].items.length, 1);
  assert.equal(result[0].items[0].requestId, 30);
});

test('pendingHandouts excludes a delivered request allocated to two shipments', async () => {
  const { pendingHandouts } = await import('./literatureShipments.mjs');
  const publication = { id: 1, code: 'nwtls', name: '聖經', language: 'CHT', format: 'standard' };
  const recipient = { personId: 1, requestId: 30, quantity: 1, source: 'request' };
  const allocations = new Map([
    [10, [{ publication, recipients: [recipient] }]],
    [11, [{ publication, recipients: [recipient] }]],
  ]);
  const result = pendingHandouts({
    shipments: [{ id: 10 }, { id: 11 }],
    allocations,
    deliveries: [{ personId: 1, publicationId: 1, requestId: 30 }],
    requests: [{ id: 30, personId: 1, publicationId: 1, status: 'received', publication }],
    people: [{ id: 1, name: '王小明' }],
  });

  assert.equal(result.length, 0);
});

test('handoutSummary merges months in chronological order and combines quantities', async () => {
  const { handoutSummary } = await import('./literatureShipments.mjs');
  assert.equal(handoutSummary([
    { label: '研讀版 1月', code: 'w27.1', quantity: 1 },
    { label: '研讀版 12月', code: 'w26.12', quantity: 1 },
    { label: '手冊 英 1月', code: 'mwb27.1', quantity: 2 },
    { label: '手冊 英 12月', code: 'mwb26.12', quantity: 2 },
  ]), '研讀版 12月·1月 · 手冊 英 12月·1月 ×2');
  assert.equal(handoutSummary([
    { label: '研讀版 1月', code: 'w27.1', quantity: 1 },
    { label: '研讀版 12月', code: 'w26.12', quantity: 1 },
    { label: '研讀版 12月', code: 'w26.12', quantity: 1 },
    { label: '大字 1月', code: 'wlp27.1', quantity: 3 },
    { label: '書籍', code: 'book', quantity: 2 },
  ]), '研讀版 12月×2·1月 · 大字 1月 ×3 · 書籍 ×2');
});
