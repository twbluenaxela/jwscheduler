import { dbErrorResponse } from '../../../../lib/apiErrors.mjs';
export const dynamic = 'force-dynamic';
import { ensureCalendarFeed, calendarLinks } from '../../../../lib/calendarFeed.mjs';
import db from '../../../../lib/db';
import { verifyIdToken } from '../../../../lib/firebase-admin';
import { publicOrigin } from '../../../../lib/publicOrigin.mjs';
import { canEdit } from '../../../../lib/roles.mjs';

async function authorize(request, context) {
  const decoded = await verifyIdToken(request);
  const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.congregationId || !canEdit(user.role)) throw new Error('沒有權限');
  const { id } = await context.params;
  const person = await db.person.findFirst({ where: { id: Number(id), congregationId: user.congregationId } });
  if (!person) throw new Error('找不到人員');
  return person;
}
export async function POST(request, context) {
  try {
    const person = await authorize(request, context);
    const feed = await ensureCalendarFeed(db, person);
    const links = calendarLinks(publicOrigin(request), feed.token, person.name);
    return Response.json({ url: links.ics, page: links.page });
  } catch (error) { return dbErrorResponse(error, 403); }
}
export async function DELETE(request, context) {
  try {
    const person = await authorize(request, context);
    await db.calendarFeed.deleteMany({ where: { personId: person.id, congregationId: person.congregationId } });
    return Response.json({ ok: true });
  } catch (error) { return dbErrorResponse(error, 403); }
}
