import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isCountable, previousMonth, receivedByPublication, buildCountLines, distributed, parseHubInventoryReport } from './literatureInventory.mjs';

test('both PDF extraction layouts contain the complete report', async () => {
  for (const suffix of ['', '.unpdf']) {
    const text = await readFile(new URL(`./test-fixtures/hub-inventory-2026-10${suffix}.txt`, import.meta.url), 'utf8');
    const report = parseHubInventoryReport(text);
    assert.equal(report.month, '2026-10');
    assert.equal(report.language, 'CHT');
    assert.equal(report.items.length, 43);
    for (const [code, quantity] of Object.entries({ lffi: 1074, inv: 5000, wcg: 10, 'T-pry': 500, 'wp26.1': 161, 'S-24': 500, be: 4 })) {
      assert.equal(report.items.find((item) => item.code === code)?.quantity, quantity);
    }
  }
});
test('count defaults, receipts and opening balances', () => {
  const p = { id: 1, code: 'other-book', category: 'book', active: true };
  assert.equal(isCountable(p), true);
  assert.equal(isCountable({ ...p, code: 'gwt1' }), false);
  assert.equal(isCountable({ ...p, category: 'study', countable: true }), true);
  assert.equal(previousMonth('2026-01'), '2025-12');
  const received = receivedByPublication([{ shippedAt: '2026-10-01', lines: [{ publicationId: 1, quantity: 3 }] }], '2026-10');
  const [line] = buildCountLines({ publications: [p], previousLines: [{ publicationId: 1, onHand: 5 }], received });
  assert.deepEqual(line, { publicationId: 1, opening: 5, received: 3, onHand: null });
  assert.equal(distributed(line), null);
  assert.equal(distributed({ ...line, onHand: 4 }), 4);
});

test('reports use S-28 order and group positive stock for Hub', async () => {
  const { s28Rows, hubReportRows } = await import('./literatureInventory.mjs');
  const publications = [
    { id: 1, code: 'T-pry', name: 'Tract', category: 'toolbox', language: 'CHT', format: 'standard', s28Order: 2 },
    { id: 2, code: 'be', name: 'Book', category: 'book', language: 'CHT', format: 'standard', s28Order: 1 },
    { id: 3, code: 'inv', name: 'Invitation', category: 'toolbox', language: 'CHT', format: 'standard' },
  ];
  const lines = publications.map((p) => ({ publicationId: p.id, onHand: p.id === 3 ? 0 : 4 }));
  assert.deepEqual(s28Rows(publications, lines).map((r) => r.publication.code), ['be', 'T-pry', 'inv']);
  assert.deepEqual(hubReportRows(publications, lines).map((r) => r.section), ['書籍', '傳單']);
});

test('late receipts add missing lines with previous balances without duplicating existing lines', async () => {
  const { missingReceivedLines } = await import('./literatureInventory.mjs');
  const received = new Map([[1, 2], [2, 7], [3, 4], [4, 0]]);
  const lines = missingReceivedLines({
    lines: [{ publicationId: 1 }],
    previousLines: [{ publicationId: 2, onHand: 8 }, { publicationId: 3, onHand: null }],
    received,
  });
  assert.deepEqual(lines, [
    { publicationId: 2, opening: 8, received: 7, onHand: null },
    { publicationId: 3, opening: 0, received: 4, onHand: null },
  ]);
});
