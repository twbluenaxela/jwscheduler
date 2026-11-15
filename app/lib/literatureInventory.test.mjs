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
    publications: [1, 2, 3, 4].map((id) => ({ id, code: `book${id}`, category: 'book' })),
    lines: [{ publicationId: 1 }],
    previousLines: [{ publicationId: 2, onHand: 8 }, { publicationId: 3, onHand: null }],
    received,
  });
  assert.deepEqual(lines, [
    { publicationId: 2, opening: 8, received: 7, onHand: null },
    { publicationId: 3, opening: 0, received: 4, onHand: null },
  ]);
});

test('report import batches inserts and preserves previous balances for matched and new items', async () => {
  const { importHubReport } = await import('./inventoryServer.js');
  const publications = [{ id: 1, code: 'be', name: 'Book', category: 'book', language: 'CHT', format: 'standard', active: true }];
  const operations = [];
  const tx = {
    inventoryCount: {
      findUnique: async ({ where }) => where.id ? { id: 10, status: 'done' } : { id: 10, status: 'draft' },
      updateMany: async () => ({ count: 1 }),
      findFirst: async () => ({ lines: [{ publicationId: 1, onHand: 9 }] }),
    },
    publication: {
      findMany: async () => [...publications],
      createMany: async ({ data, skipDuplicates }) => {
        operations.push({ type: 'publications', data, skipDuplicates });
        publications.push(...data.map((p) => ({ ...p, id: 2, active: true })));
      },
    },
    shipment: { findMany: async () => [] },
    inventoryLine: {
      createMany: async (args) => operations.push({ type: 'createLines', ...args }),
      updateMany: async (args) => operations.push({ type: 'updateLines', ...args }),
    },
  };
  const client = {
    $transaction: async (callback, options) => {
      assert.deepEqual(options, { timeout: 60000, maxWait: 10000 });
      return callback(tx);
    },
  };
  const report = { month: '2026-10', language: 'CHT', items: [
    { code: 'be', name: 'Book', quantity: 4 },
    { code: 'T-new', name: 'New', quantity: 12 },
  ] };
  assert.equal((await importHubReport(1, report, { db: client })).id, 10);
  assert.equal(operations.filter((op) => op.type === 'publications').length, 1);
  assert.equal(operations.find((op) => op.type === 'publications').data[0].category, 'toolbox');
  const inserts = operations.find((op) => op.type === 'createLines');
  assert.equal(inserts.skipDuplicates, true);
  assert.ok(inserts.data.some((line) => line.publicationId === 1 && line.opening === 9 && line.onHand === 4));
  assert.ok(inserts.data.some((line) => line.publicationId === 2 && line.opening === 0 && line.onHand === 12));
});

test('late receipts skip non-countable and unknown publications', async () => {
  const { missingReceivedLines } = await import('./literatureInventory.mjs');
  const publications = [
    { id: 1, code: 'be', category: 'book' },
    { id: 2, code: 'w27.01', category: 'study' },
    { id: 3, code: 'nwtls', category: 'bible' },
  ];
  const received = new Map([[1, 2], [2, 3], [3, 4], [4, 5]]);
  assert.deepEqual(missingReceivedLines({ lines: [], previousLines: [], received, publications }), [
    { publicationId: 1, opening: 0, received: 2, onHand: null },
  ]);
});
