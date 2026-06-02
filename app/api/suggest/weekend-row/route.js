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
    const refDate = body.date || new Date(); // row's meeting date → past-only measured from it

    const [people, pastRows] = await Promise.all([
      db.person.findMany({ where: { congregationId: user.congregationId, status: 'active' } }),
      db.weekendRow.findMany({
        where: { congregationId: user.congregationId },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
    ]);

    const normalPeople = people.map(p => ({
      name: p.name, g: p.gender, quals: p.tags ?? [], status: p.status,
    }));
    const scheduleRows = pastRows.filter(r => r.type !== 'event' && r.type !== 'suspended');

    const suggestion = suggestWeekendRow(normalPeople, scheduleRows, existing, refDate);
    return NextResponse.json({ suggestion });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
