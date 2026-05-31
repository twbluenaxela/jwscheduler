export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';

// POST /api/congregations/join  { inviteToken }
export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const { inviteToken } = await request.json();

    if (!inviteToken) return NextResponse.json({ error: '缺少邀請碼' }, { status: 400 });

    const congregation = await db.congregation.findUnique({ where: { inviteToken } });
    if (!congregation) return NextResponse.json({ error: '邀請連結無效' }, { status: 404 });

    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.congregationId) {
      return NextResponse.json({ error: '你已經加入了一個會眾' }, { status: 409 });
    }

    const updated = await db.user.update({
      where: { id: user.id },
      data: { congregationId: congregation.id },
      include: { congregation: true },
    });

    return NextResponse.json({ user: updated, congregation });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
