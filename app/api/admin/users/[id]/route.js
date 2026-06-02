export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../../lib/firebase-admin';
import db from '../../../../lib/db';
import { ROLES, isSysadmin } from '../../../../lib/roles.mjs';

// PATCH /api/admin/users/[id]  { role?, congregationId? } — sysadmin only.
export async function PATCH(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const actor = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!isSysadmin(actor?.role)) return NextResponse.json({ error: '需要系統管理員權限' }, { status: 403 });

    const id = Number((await context.params).id);
    const body = await request.json();
    const data = {};

    if ('role' in body) {
      if (!Object.values(ROLES).includes(body.role)) return NextResponse.json({ error: '無效的角色' }, { status: 400 });
      data.role = body.role;
    }
    if ('congregationId' in body) {
      data.congregationId = body.congregationId == null ? null : Number(body.congregationId);
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });

    // Guard: don't let a sysadmin strip their own sysadmin role (lockout).
    if (id === actor.id && data.role && data.role !== ROLES.SYSADMIN) {
      return NextResponse.json({ error: '無法變更自己的系統管理員角色' }, { status: 400 });
    }

    const user = await db.user.update({
      where: { id },
      data,
      select: { id: true, email: true, displayName: true, role: true, congregationId: true },
    });
    return NextResponse.json({ user });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
