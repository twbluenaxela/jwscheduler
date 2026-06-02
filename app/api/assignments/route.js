export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../lib/firebase-admin';
import db from '../../lib/db';
import { describeMidweekSlot, logChange } from '../../lib/changelog.mjs';

export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });

    const { slotId, name } = await request.json();
    if (typeof slotId !== 'string') return NextResponse.json({ error: '缺少 slotId' }, { status: 400 });

    const match = slotId.match(/^mw(\d+)_/);
    if (!match) return NextResponse.json({ error: '無效的 slotId 格式' }, { status: 400 });
    const weekId = parseInt(match[1]);

    const week = await db.midweekWeek.findFirst({
      where: { id: weekId, congregationId: user.congregationId },
      include: { parts: true },
    });
    if (!week) return NextResponse.json({ error: '找不到週次或無權限' }, { status: 403 });

    const before = await db.assignment.findUnique({ where: { slotId } });
    const prevName = before?.name ?? '';

    if (!name) {
      await db.assignment.deleteMany({ where: { slotId } });
    } else {
      await db.assignment.upsert({
        where: { slotId },
        create: { slotId, weekId, name },
        update: { name },
      });
    }

    const slot = describeMidweekSlot(week, slotId);
    await logChange(db, {
      congregationId: user.congregationId,
      slotId,
      date: slot?.date ?? week.date,
      label: slot?.label ?? slotId,
      prevName,
      name: name ?? '',
      actorName: user.displayName,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
