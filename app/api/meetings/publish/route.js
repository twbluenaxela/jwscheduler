import { pushLine } from '../../../lib/linePush.mjs';
import { dbErrorResponse } from '../../../lib/apiErrors.mjs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { applyPublish } from '../../../lib/publish.mjs';
import { canManageCongregation } from '../../../lib/roles.mjs';

export async function POST(request) {
  try {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'LINE 通知尚未設定' }, { status: 503 });
    }

    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canManageCongregation(user.role)) {
      return NextResponse.json({ error: '需要管理員權限' }, { status: 403 });
    }

    const result = await applyPublish(db, user, { push: pushLine });
    return NextResponse.json(result);
  } catch (err) {
    return dbErrorResponse(err);
  }
}
