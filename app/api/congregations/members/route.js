export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { ASSIGNABLE_MEMBER_ROLES, canManageCongregation, isSysadmin } from '../../../lib/roles.mjs';

// PATCH /api/congregations/members  { userId, role } — admin sets a member's role
// (e.g. demote to GUEST / promote to MEMBER or ADMIN).
export async function PATCH(request) {
  try {
    const decoded = await verifyIdToken(request);
    const actor = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!actor?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canManageCongregation(actor.role)) return NextResponse.json({ error: '需要管理員權限' }, { status: 403 });

    const { userId, role } = await request.json();
    if (!ASSIGNABLE_MEMBER_ROLES.includes(role)) return NextResponse.json({ error: '無效的角色' }, { status: 400 });

    const target = await db.user.findFirst({
      where: { id: Number(userId), congregationId: actor.congregationId },
    });
    if (!target) return NextResponse.json({ error: '找不到成員' }, { status: 404 });
    // Guard against an admin locking themselves out of admin.
    if (target.id === actor.id) return NextResponse.json({ error: '無法變更自己的角色' }, { status: 400 });
    // A congregation admin cannot change a sysadmin's role.
    if (isSysadmin(target.role)) return NextResponse.json({ error: '無法變更系統管理員的角色' }, { status: 403 });

    const updated = await db.user.update({
      where: { id: target.id },
      data: { role },
      select: { id: true, displayName: true, email: true, role: true },
    });
    return NextResponse.json({ user: updated });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
