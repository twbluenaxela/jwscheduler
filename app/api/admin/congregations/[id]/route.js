export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../../lib/firebase-admin';
import db from '../../../../lib/db';
import { isSysadmin } from '../../../../lib/roles.mjs';

async function requireSysadmin(request) {
  const decoded = await verifyIdToken(request);
  const actor = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
  return isSysadmin(actor?.role);
}

// PATCH /api/admin/congregations/[id]  { name } — rename (sysadmin only).
export async function PATCH(request, context) {
  try {
    if (!(await requireSysadmin(request))) return NextResponse.json({ error: '需要系統管理員權限' }, { status: 403 });
    const id = Number((await context.params).id);
    const body = await request.json();
    const name = String(body.name ?? '').trim();
    if (!name) return NextResponse.json({ error: '會眾名稱為必填' }, { status: 400 });

    const congregation = await db.congregation.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, code: true },
    });
    return NextResponse.json({ congregation });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/admin/congregations/[id] — delete + cascade (sysadmin only).
export async function DELETE(request, context) {
  try {
    if (!(await requireSysadmin(request))) return NextResponse.json({ error: '需要系統管理員權限' }, { status: 403 });
    const id = Number((await context.params).id);
    // Detach users so they fall back to onboarding rather than being deleted.
    await db.user.updateMany({ where: { congregationId: id }, data: { congregationId: null } });
    await db.congregation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
