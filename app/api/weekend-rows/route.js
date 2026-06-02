export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../lib/firebase-admin';
import db from '../../lib/db';
import { canEdit } from '../../lib/roles.mjs';

export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canEdit(user.role)) return NextResponse.json({ error: '訪客無法修改' }, { status: 403 });

    const { type = 'schedule', date = '' } = await request.json();

    const last = await db.weekendRow.findFirst({
      where: { congregationId: user.congregationId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const sortOrder = (last?.sortOrder ?? 0) + 1;

    const row = await db.weekendRow.create({
      data: {
        congregationId: user.congregationId,
        sortOrder,
        type,
        date, no: '', topic: '', cong: '',
        speaker: '', chair: '', wt: '', read: '',
        host: '', away: '', label: '', note: '',
      },
    });

    return NextResponse.json({ row: { ...row, _id: row.id } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
