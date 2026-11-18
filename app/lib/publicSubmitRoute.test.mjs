import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { pushLine } from './linePush.mjs';
import { publicOrigin } from './publicOrigin.mjs';

test('submission succeeds when the deferred LINE request fails', async () => {
  const source = await readFile(new URL('../api/public/literature/[token]/submit/route.js', import.meta.url), 'utf8');
  const code = source
    .replace(/^import .*;\n/gm, '')
    .replace("export const dynamic = 'force-dynamic';", '')
    .replace('export async function POST', 'async function POST');
  const person = { id: 1, name: '甲', lineUserId: 'line-id', serviceGroup: 'B' };
  const publication = { id: 2, code: 'book', name: '書' };
  let deferred;
  let messageOrigin;
  const tx = {
    literatureRequest: { create: async () => ({ id: 3 }) },
    literatureFormSubmission: {
      count: async () => 0,
      create: async ({ data }) => ({ id: 4, ...data }),
    },
  };
  const db = {
    person: { findMany: async () => [person] },
    publication: { findMany: async () => [publication] },
    $transaction: async (callback) => callback(tx),
  };
  const originalFetch = globalThis.fetch;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    const context = vm.createContext({
      db,
      after: (callback) => { deferred = callback; },
      publicCongregation: async () => ({ id: 1, inventoryReminderPersonId: 1 }),
      publicJson: (body, status = 200) => ({ body, status }),
      disabled: () => ({ status: 404 }),
      validateSubmission: () => ({ personId: 1, items: [{ publicationId: 2, quantity: 1, kind: 'once' }] }),
      localizedName: (entry) => entry.name,
      flagSubmission: () => ({ flagged: false, reason: null }),
      formSubmissionMessage: ({ origin }) => {
        messageOrigin = origin;
        return 'message';
      },
      publicOrigin,
      pushLine,
      URL,
      console: { error() {} },
    });
    const post = vm.runInContext(`${code}\nPOST`, context);
    const result = await post({
      url: 'https://example.org/submit',
      headers: new Headers({
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'public.example.org',
      }),
      json: async () => ({}),
    }, { params: Promise.resolve({ token: 'test' }) });
    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    await deferred();
    assert.equal(messageOrigin, 'https://public.example.org');
  } finally {
    globalThis.fetch = originalFetch;
    if (token === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
    else process.env.LINE_CHANNEL_ACCESS_TOKEN = token;
  }
});
