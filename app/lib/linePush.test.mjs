import test from 'node:test';
import assert from 'node:assert/strict';
import { pushLine } from './linePush.mjs';

test('pushLine does not call LINE without a token', async () => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const originalFetch = globalThis.fetch;
  delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
  globalThis.fetch = () => { throw new Error('fetch should not run'); };
  try {
    const result = await pushLine('user', 'message');
    assert.equal(result.ok, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (token !== undefined) process.env.LINE_CHANNEL_ACCESS_TOKEN = token;
  }
});
