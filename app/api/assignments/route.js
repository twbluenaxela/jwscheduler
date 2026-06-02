export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../lib/firebase-admin';
import db from '../../lib/db';
import { applyMidweekAssignment } from '../../lib/mutations.mjs';
import { canEdit } from '../../lib/roles.mjs';

export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canEdit(user.role)) return NextResponse.json({ error: '訪客無法修改' }, { status: 403 });

    const { slotId, name } = await request.json();
    const { status, body } = await applyMidweekAssignment(db, user, slotId, name);
    return NextResponse.json(body, { status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
