import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarResponse } from './calendarFeed.mjs';
import { previousMonth } from './literatureInventory.mjs';

function fakeDb(reminderId, counts = []) {
  const feed = {
    id: 1,
    congregationId: 1,
    person: { id: 2, congregationId: 1, name: '測試' },
    congregation: { code: 'test', inventoryReminderPersonId: reminderId },
  };
  const empty = { findMany: async () => [] };
  const queries = [];
  return {
    queries,
    calendarFeed: { findUnique: async () => feed, update: async () => {} },
    midweekWeek: empty,
    weekendRow: empty,
    serviceCategory: empty,
    serviceAssignment: empty,
    fieldServiceMeeting: empty,
    inventoryCount: {
      findMany: async ({ where }) => {
        queries.push(where);
        return counts.filter((count) => count.month >= where.month.gte);
      },
    },
  };
}

function eventsOf(calendar) {
  return [...calendar.matchAll(/BEGIN:VEVENT\r\n([\s\S]*?)\r\nEND:VEVENT/g)]
    .map((match) => match[1]);
}

test('reminders use the previous count month and stable event-date UIDs', async () => {
  const initial = fakeDb(2);
  const calendar = await (await calendarResponse(initial, 'token', { origin: 'https://example.test' })).text();
  const events = eventsOf(calendar);
  assert.equal(events.length, 13);
  const firstKey = events[0].match(/UID:inventory-(\d{4}-\d{2})@test/)[1];
  assert.equal(initial.queries[0].month.gte, previousMonth(firstKey));
  assert.match(events[0], /DTSTART;VALUE=DATE:\d{6}10/);
  assert.match(events[0], /DTEND;VALUE=DATE:\d{6}11/);
  assert.match(events[0], /TRIGGER:-P3D\r\nACTION:DISPLAY/);
  assert.match(events[0], /https:\/\/example.test\/literature/);

  const december = events.find((event) => /DTSTART;VALUE=DATE:\d{4}1210/.test(event));
  const decemberYear = december.match(/DTSTART;VALUE=DATE:(\d{4})1210/)[1];
  assert.match(december, /SUMMARY:書刊清點截止（11月）/);
  const db = fakeDb(2, [{ month: `${decemberYear}-11`, status: 'done' }]);
  const completed = await (await calendarResponse(db, 'token', { origin: 'https://example.test' })).text();
  const decemberDone = eventsOf(completed).find((event) => event.includes(`UID:inventory-${decemberYear}-12@test`));
  assert.match(decemberDone, /SUMMARY:✓ 書刊清點完成（11月）/);
  assert.ok(decemberDone.includes(`UID:inventory-${decemberYear}-12@test`));
  const january = events.find((event) => /DTSTART;VALUE=DATE:\d{4}0110/.test(event));
  assert.match(january, /SUMMARY:書刊清點截止（12月）/);
});

test('other people do not receive inventory events', async () => {
  const calendar = await (await calendarResponse(fakeDb(3), 'token')).text();
  assert.doesNotMatch(calendar, /inventory-/);
});
