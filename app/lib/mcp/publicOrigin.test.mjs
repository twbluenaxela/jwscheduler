import test from 'node:test';
import assert from 'node:assert/strict';
import { publicOrigin } from '../publicOrigin.mjs';

test('公開網址各自採用轉送標頭，並回退至 host 與 request URL', () => {
  const request = (headers = {}) => new Request('http://internal:3000/path', { headers });
  assert.equal(publicOrigin(request({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'app.example.com' })),
    'https://app.example.com');
  assert.equal(publicOrigin(request({ 'x-forwarded-proto': 'https', host: 'example.com' })), 'https://example.com');
  assert.equal(publicOrigin(request({ 'x-forwarded-host': 'example.com' })), 'http://example.com');
  assert.equal(publicOrigin(request()), 'http://internal:3000');
  assert.equal(publicOrigin(request({ 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'public.test, internal' })),
    'https://public.test');
});
