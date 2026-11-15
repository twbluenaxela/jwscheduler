import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarLinks, ensureCalendarFeed } from './calendarFeed.mjs';
import { makeFakeDb } from './test-support/fake-db.mjs';

test('calendar links encode the subscription URL and calendar name', () => {
  const links = calendarLinks('https://example.com:8443', 'abc_123', '王大明');
  assert.equal(links.page, 'https://example.com:8443/cal/abc_123');
  assert.equal(links.ics, 'https://example.com:8443/api/calendar/abc_123.ics');
  assert.equal(links.webcal, 'webcal://example.com:8443/api/calendar/abc_123.ics');
  assert.equal(new URL(links.google).searchParams.get('cid'), links.webcal);
  for (const link of [links.outlook, links.office]) {
    assert.equal(new URL(link).searchParams.get('url'), links.ics);
    assert.equal(new URL(link).searchParams.get('name'), '王大明 聚會安排');
  }
});

test('ensuring a feed preserves the existing token', async () => {
  const db = makeFakeDb();
  const person = { id: 1, congregationId: 2 };
  const first = await ensureCalendarFeed(db, person);
  const second = await ensureCalendarFeed(db, person);
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(second.token, first.token);
  assert.equal(db.__stores.calendarFeeds.length, 1);
});
