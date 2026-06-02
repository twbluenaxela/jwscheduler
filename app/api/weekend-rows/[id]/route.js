export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { applyWeekendPatch } from '../../../lib/mutations.mjs';
import { canEdit } from '../../../lib/roles.mjs';

export async function DELETE(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canEdit(user.role)) return NextResponse.json({ error: '訪客無法修改' }, { status: 403 });

    const params = await context.params;
    const id = Number(params.id);
    const existing = await db.weekendRow.findFirst({
      where: { id, congregationId: user.congregationId },
    });
    if (!existing) return NextResponse.json({ error: '找不到週末排程' }, { status: 404 });

    await db.weekendRow.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canEdit(user.role)) return NextResponse.json({ error: '訪客無法修改' }, { status: 403 });

    const params = await context.params;
    const id = Number(params.id);
    const existing = await db.weekendRow.findFirst({
      where: { id, congregationId: user.congregationId },
    });
    if (!existing) return NextResponse.json({ error: '找不到週末排程' }, { status: 404 });

    const body = await request.json();
    const { status, body: resBody } = await applyWeekendPatch(db, user, existing, body);
    return NextResponse.json(resBody, { status });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
