export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { isSysadmin } from '../../../lib/roles.mjs';

// GET /api/admin/data — all congregations + all users (sysadmin only).
export async function GET(request) {
  try {
    const decoded = await verifyIdToken(request);
    const actor = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!isSysadmin(actor?.role)) return NextResponse.json({ error: '需要系統管理員權限' }, { status: 403 });

    const [congregations, users] = await Promise.all([
      db.congregation.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, code: true,
          _count: { select: { users: true, weeks: true, people: true } },
        },
      }),
      db.user.findMany({
        orderBy: [{ congregationId: 'asc' }, { email: 'asc' }],
        select: { id: true, email: true, displayName: true, role: true, congregationId: true },
      }),
    ]);

    return NextResponse.json({ congregations, users });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
