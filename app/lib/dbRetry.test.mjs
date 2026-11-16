import test from 'node:test';
import assert from 'node:assert/strict';
import { isTransientDbError, retryTransient, withDbParams } from './dbRetry.mjs';

test('recognizes transient database codes, initialization errors and connection messages', () => {
  for (const code of ['P1001', 'P1002', 'P1008', 'P1017', 'P2024']) {
    assert.equal(isTransientDbError({ code }), true);
  }
  assert.equal(isTransientDbError({ name: 'PrismaClientInitializationError' }), true);
  for (const message of ["Can't reach database server", 'Connection terminated unexpectedly', 'Server has closed the connection', 'Timed out fetching a new connection', 'Connection refused', 'ECONNRESET', 'ETIMEDOUT']) {
    assert.equal(isTransientDbError({ message }), true);
  }
  assert.equal(isTransientDbError({ code: 'P2002', message: 'duplicate' }), false);
  assert.equal(isTransientDbError(null), false);
});

test('adds missing connection parameters without replacing existing values', () => {
  const plain = new URL(withDbParams('postgresql://user:pass@host/db'));
  assert.equal(plain.searchParams.get('connect_timeout'), '20');
  assert.equal(plain.searchParams.get('pool_timeout'), '20');
  const existing = new URL(withDbParams('postgres://host/db?sslmode=require&connect_timeout=5&pool_timeout=7'));
  assert.equal(existing.searchParams.get('sslmode'), 'require');
  assert.equal(existing.searchParams.get('connect_timeout'), '5');
  assert.equal(existing.searchParams.get('pool_timeout'), '7');
  assert.equal(withDbParams(undefined), undefined);
  assert.equal(withDbParams('https://example.com'), 'https://example.com');
});

test('retries transient failures with the configured delays', async () => {
  const waits = [];
  let attempts = 0;
  const value = await retryTransient(() => {
    if (++attempts < 4) throw Object.assign(new Error('offline'), { code: 'P1001' });
    return 'ready';
  }, { sleep: async (ms) => waits.push(ms) });
  assert.equal(value, 'ready');
  assert.deepEqual(waits, [300, 1000, 2500]);
});

test('rethrows non-transient errors and exhausted transient errors', async () => {
  const ordinary = new Error('bad input');
  let attempts = 0;
  await assert.rejects(retryTransient(() => { attempts++; throw ordinary; }, { sleep: async () => {} }), (error) => error === ordinary);
  assert.equal(attempts, 1);
  const transient = Object.assign(new Error('offline'), { code: 'P1017' });
  attempts = 0;
  await assert.rejects(retryTransient(() => { attempts++; throw transient; }, { retries: 2, sleep: async () => {} }), (error) => error === transient);
  assert.equal(attempts, 3);
});
