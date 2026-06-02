export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { canManageCongregation } from '../../../lib/roles.mjs';

// PATCH /api/congregations/settings — update congregation settings (admin only)
export async function PATCH(request) {
  try {
    const decoded = await verifyIdToken(request);
    const body = await request.json();

    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canManageCongregation(user.role)) return NextResponse.json({ error: '需要管理員權限' }, { status: 403 });

    const allowed = ['name', 'meetingDayOffset', 'meetingTime', 'exceptions'];
    const data = Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k)));

    const congregation = await db.congregation.update({
      where: { id: user.congregationId },
      data,
    });

    return NextResponse.json({ congregation });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// GET /api/congregations/settings — get current congregation + members
export async function GET(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    // Settings exposes invite tokens + member emails + role management — admin only.
    if (!canManageCongregation(user.role)) return NextResponse.json({ error: '需要管理員權限' }, { status: 403 });

    const congregation = await db.congregation.findUnique({
      where: { id: user.congregationId },
      include: { users: { select: { id: true, displayName: true, email: true, role: true } } },
    });

    return NextResponse.json({ congregation });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
