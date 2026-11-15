export const dynamic = 'force-dynamic';
import { randomBytes } from 'node:crypto';
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
    const feed = await db.calendarFeed.upsert({ where: { personId: person.id }, update: {}, create: {
      personId: person.id, congregationId: person.congregationId, token: randomBytes(32).toString('base64url'),
    } });
    return Response.json({ url: `${publicOrigin(request)}/api/calendar/${feed.token}.ics` });
  } catch (error) { return Response.json({ error: error.message }, { status: 403 }); }
}
export async function DELETE(request, context) {
  try {
    const person = await authorize(request, context);
    await db.calendarFeed.deleteMany({ where: { personId: person.id, congregationId: person.congregationId } });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error.message }, { status: 403 }); }
}
