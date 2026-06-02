export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../lib/firebase-admin';
import db from '../../lib/db';

// Recent assignment changes for the caller's congregation (newest first).
export async function GET(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (user.role !== 'ADMIN') return NextResponse.json({ error: '需要管理員權限' }, { status: 403 });

    const entries = await db.changeLog.findMany({
      where: { congregationId: user.congregationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ entries });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
