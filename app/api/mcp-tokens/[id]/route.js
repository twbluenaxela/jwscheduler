export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../lib/db';
import { verifyIdToken } from '../../../lib/firebase-admin';
import { canLiterature } from '../../../lib/roles.mjs';
import { fail, id } from '../../../lib/literatureApi';
export async function DELETE(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId || !canLiterature(user)) throw Object.assign(new Error('需要書刊權限'), { status: 403 });
    const result = await db.mcpToken.updateMany({ where: { id: id((await context.params).id), userId: user.id }, data: { revokedAt: new Date() } });
    if (!result.count) throw Object.assign(new Error('找不到連結'), { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error); }
}
