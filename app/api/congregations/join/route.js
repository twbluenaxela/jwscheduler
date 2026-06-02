export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { ROLES, isSysadmin } from '../../../lib/roles.mjs';

// POST /api/congregations/join  { code }  (preferred — enter the congregation code)
//                            or { congregationId }  (dropdown)
//                            or { inviteToken }      (legacy link)
// Everyone joins read-only (VIEWER); ADMIN is granted by a sysadmin/admin.
export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const { code, congregationId, inviteToken } = await request.json();

    let congregation = null;
    if (code) {
      congregation = await db.congregation.findFirst({
        where: { code: { equals: String(code).trim(), mode: 'insensitive' } },
      });
    } else if (congregationId != null) {
      congregation = await db.congregation.findUnique({ where: { id: Number(congregationId) } });
    } else if (inviteToken) {
      congregation = await db.congregation.findUnique({ where: { inviteToken } })
        ?? await db.congregation.findUnique({ where: { guestInviteToken: inviteToken } });
    } else {
      return NextResponse.json({ error: '缺少會眾代碼' }, { status: 400 });
    }
    if (!congregation) return NextResponse.json({ error: '找不到此代碼的會眾' }, { status: 404 });

    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    // Congregation is set once at join and cannot be self-changed — only a
    // sysadmin can move a user (prevents an admin peeking into other congregations).
    if (user.congregationId) {
      return NextResponse.json({ error: '你已經加入了一個會眾，如需變更請聯絡系統管理員' }, { status: 409 });
    }

    const updated = await db.user.update({
      where: { id: user.id },
      // Joining is read-only; a sysadmin keeps their global role.
      data: { congregationId: congregation.id, role: isSysadmin(user.role) ? user.role : ROLES.VIEWER },
      include: { congregation: true },
    });

    return NextResponse.json({ user: updated, congregation });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
