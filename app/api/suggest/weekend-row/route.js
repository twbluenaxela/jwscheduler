export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { suggestWeekendRow } from '../../../lib/suggest';

export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });

    const body = await request.json().catch(() => ({}));
    const existing = body.existing ?? {};
    // Row's meeting date — the engine measures its bidirectional recency gap
    // from here (all rows are passed, so future bookings count against people).
    const refDate = body.date || new Date();

    const [people, pastRows, midweekWeeks] = await Promise.all([
      db.person.findMany({ where: { congregationId: user.congregationId, status: 'active' } }),
      db.weekendRow.findMany({
        where: { congregationId: user.congregationId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      db.midweekWeek.findMany({
        where: { congregationId: user.congregationId },
        select: {
          date: true,
          isoDate: true,
          assignments: { select: { name: true } },
        },
      }),
    ]);

    const normalPeople = people.map(p => ({
      name: p.name,
      g: p.gender,
      quals: p.tags ?? [],
      status: p.status,
      assignmentNote: p.assignmentNote ?? '',
      assignmentIntervalMonths: p.assignmentIntervalMonths ?? 0,
    }));
    const scheduleRows = pastRows.filter(r => r.type !== 'event' && r.type !== 'suspended');
    const allHistory = [];
    for (const row of scheduleRows) {
      for (const name of [row.speaker, row.chair, row.wt, row.read, row.host]) {
        if (name) allHistory.push({ name, date: row.date, isoDate: row.isoDate });
      }
    }
    for (const week of midweekWeeks) {
      for (const assignment of week.assignments) {
        if (assignment.name) {
          allHistory.push({ name: assignment.name, date: week.date, isoDate: week.isoDate });
        }
      }
    }

    const suggestion = suggestWeekendRow(normalPeople, scheduleRows, existing, refDate, allHistory);
    return NextResponse.json({ suggestion });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
