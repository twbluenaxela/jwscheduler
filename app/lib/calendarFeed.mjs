import { randomBytes } from 'node:crypto';
import { serviceEventsForPerson } from './services.mjs';
import { isMidweekSuspended } from './weekType.mjs';
import { collectAssignments } from './assignments.mjs';
import { generateIcal } from './icalExport.js';
import { resolveRowDate, toIsoDate } from './cnDate.mjs';
import { previousMonth } from './literatureInventory.mjs';

export async function ensureCalendarFeed(db, person) {
  return db.calendarFeed.upsert({
    where: { personId: person.id },
    update: {},
    create: {
      personId: person.id,
      congregationId: person.congregationId,
      token: randomBytes(32).toString('base64url'),
    },
  });
}

export function calendarLinks(origin, token, name) {
  const page = `${origin}/cal/${token}`;
  const ics = `${origin}/api/calendar/${token}.ics`;
  const webcal = `webcal://${new URL(origin).host}/api/calendar/${token}.ics`;
  const params = `url=${encodeURIComponent(ics)}&name=${encodeURIComponent(`${name} 聚會安排`)}`;
  return {
    page,
    ics,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
    outlook: `https://outlook.live.com/calendar/0/addfromweb?${params}`,
    office: `https://outlook.office.com/calendar/0/addfromweb?${params}`,
  };
}

export async function calendarResponse(db, token, { origin = "" } = {}) {
  const feed = await db.calendarFeed.findUnique({ where: { token: token.replace(/\.ics$/, '') }, include: { person: true, congregation: true } });
  if (!feed || feed.person.congregationId !== feed.congregationId) return new Response('找不到行事曆', { status: 404 });
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  cutoff.setHours(0, 0, 0, 0);
  const [weeks, rows, categories, assignments, fieldMeetings] = await Promise.all([
    db.midweekWeek.findMany({ where: { congregationId: feed.congregationId }, include: { parts: true, assignments: true } }),
    db.weekendRow.findMany({ where: { congregationId: feed.congregationId } }),
    db.serviceCategory.findMany({ where: { congregationId: feed.congregationId } }),
    db.serviceAssignment.findMany({ where: { congregationId: feed.congregationId, date: { gte: `${toIsoDate(cutoff).slice(0, 7)}-01` } } }),
    db.fieldServiceMeeting.findMany({ where: { congregationId: feed.congregationId, date: { gte: toIsoDate(cutoff) } } }),
  ]);
  const events = serviceEventsForPerson({ person: feed.person, categories, assignments, fieldMeetings, weeks, weekendRows: rows }).filter(event => event.isoDate >= toIsoDate(cutoff));
  for (const row of [...weeks, ...rows]) {
    const isWeek = Array.isArray(row.parts);
    if (isWeek && isMidweekSuspended(row)) continue;
    const items = collectAssignments(feed.person.name, isWeek ? [row] : [], isWeek ? [] : [row], { today: cutoff, skipSuspended: true });
    for (const item of items) events.push({
      ...item, label: item.role, isoDate: toIsoDate(resolveRowDate(row)), weekdayPill: isWeek ? row.weekdayPill : undefined,
    });
  }
  if (feed.congregation.inventoryReminderPersonId != null && feed.person.id === feed.congregation.inventoryReminderPersonId) {
    const startMonth = toIsoDate(cutoff).slice(0, 7);
    const counts = await db.inventoryCount.findMany({
      where: { congregationId: feed.congregationId, month: { gte: previousMonth(startMonth) } },
    });
    const done = new Set(counts.filter((count) => count.status === 'done').map((count) => count.month));
    const [year, month] = startMonth.split('-').map(Number);
    for (let offset = 0; offset <= 12; offset++) {
      const date = new Date(Date.UTC(year, month - 1 + offset, 1));
      const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
      const countMonth = previousMonth(key);
      const label = done.has(countMonth) ? '✓ 書刊清點完成' : '書刊清點截止';
      events.push({
        isoDate: `${key}-10`,
        label: `${label}（${Number(countMonth.slice(5))}月）`,
        description: `到書刊 → 清點完成上月清點\n${origin}/literature`,
        uid: `inventory-${key}@${feed.congregation.code}`,
        allDay: true,
        alarm: { trigger: '-P3D' },
      });
    }
  }
  await db.calendarFeed.update({ where: { id: feed.id }, data: { lastFetchedAt: new Date() } });
  return new Response(generateIcal(events, feed.person.name, feed.congregation.code), { headers: {
    'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Disposition': 'inline; filename="schedule.ics"',
  } });
}
