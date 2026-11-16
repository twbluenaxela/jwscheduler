import test from 'node:test';
import assert from 'node:assert/strict';
import { meetingDatesInMonth, serviceEventsForPerson } from './services.mjs';

test('service duties include slots, split cleaning groups and field meetings, skipping suspended meetings', () => {
  const weeks = [{ isoDate: '2026-11-04', weekdayPill: '星期三 · 19:30' }, { isoDate: '2026-11-11', type: 'suspended' }];
  const weekendRows = [{ isoDate: '2026-11-08', type: 'schedule' }, { isoDate: '2026-11-15', type: 'event' }];
  assert.deepEqual(meetingDatesInMonth('2026-11', weeks, weekendRows).map(item => item.iso), ['2026-11-04', '2026-11-08']);
  const events = serviceEventsForPerson({ person: { id: 1, serviceGroup: 'B' }, weeks, weekendRows,
    categories: [{ id: 1, kind: 'slots', name: '麥克風服務', positions: ['左邊', '右邊'] }, { id: 2, kind: 'groups' }],
    assignments: [{ categoryId: 1, date: '2026-11-04', position: '左邊', personId: 1 }, { categoryId: 2, date: '2026-11-01', text: 'A+B,C' }],
    fieldMeetings: [{ date: '2026-11-03', time: '09:00', leaderId: 1, place: '會所', territory: '一區', note: '備註' }] });
  assert.equal(events.length, 4);
  assert.equal(events[0].label, '麥克風服務（左邊）');
  assert.equal(events[1].label, '聚會後打掃（A+B+C 組）');
  assert.equal(events[2].kind, 'weekend');
  assert.equal(events[3].description, '一區\n備註');
});

test('upcoming service items include today and sort by date and time', async () => {
  const { upcomingServiceItems } = await import('./services.mjs');
  const items = [
    { isoDate: '2026-11-17', time: '10:00' },
    { isoDate: '2026-11-16', time: '15:00' },
    { isoDate: '2026-11-15', time: '09:00' },
    { isoDate: '2026-11-16', time: '09:00' },
  ];
  assert.deepEqual(upcomingServiceItems(items, '2026-11-16'), [items[3], items[1], items[0]]);
  assert.equal(items.length, 4);
});
