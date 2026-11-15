import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seriesOf, issueOf, hubLanguage, splitHubCode, parsePackingSlip, matchShipmentLines, allocateShipment } from './literatureShipments.mjs';

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
