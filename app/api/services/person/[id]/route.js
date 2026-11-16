import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../../lib/firebase-admin';
import db from '../../../../lib/db';
import { dbErrorResponse } from '../../../../lib/apiErrors.mjs';
import { canEdit } from '../../../../lib/roles.mjs';
import { serviceEventsForPerson, upcomingServiceItems } from '../../../../lib/services.mjs';

export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canEdit(user.role)) return NextResponse.json({ error: '訪客無法修改' }, { status: 403 });

    const id = Number((await context.params).id);
    if (!Number.isSafeInteger(id) || id < 1)
      return NextResponse.json({ error: '找不到人員' }, { status: 404 });
    const congregationId = user.congregationId;
    const person = await db.person.findFirst({ where: { id, congregationId } });
    if (!person) return NextResponse.json({ error: '找不到人員' }, { status: 404 });

    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const [categories, assignments, fieldMeetings, weeks, weekendRows] = await Promise.all([
      db.serviceCategory.findMany({ where: { congregationId } }),
      db.serviceAssignment.findMany({ where: { congregationId, date: { gte: `${today.slice(0, 7)}-01` } } }),
      db.fieldServiceMeeting.findMany({ where: { congregationId, leaderId: id, date: { gte: today } } }),
      db.midweekWeek.findMany({ where: { congregationId } }),
      db.weekendRow.findMany({ where: { congregationId } }),
    ]);
    const items = upcomingServiceItems(
      serviceEventsForPerson({ person, categories, assignments, fieldMeetings, weeks, weekendRows }),
      today,
    );
    return NextResponse.json({ items });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
