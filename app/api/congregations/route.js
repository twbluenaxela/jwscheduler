export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../lib/firebase-admin';
import db from '../../lib/db';
import { isSysadmin } from '../../lib/roles.mjs';

// POST /api/congregations — create a new congregation, make caller the first ADMIN.
// Sysadmin-only (congregations are otherwise created from the /admin panel, which
// does NOT auto-join the creator). Prevents viewers from self-creating to escalate.
export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const { name, code } = await request.json();

    if (!name?.trim() || !code?.trim()) {
      return NextResponse.json({ error: '名稱和代碼不能為空' }, { status: 400 });
    }

    const slug = code.trim().toLowerCase().replace(/\s+/g, '-');

    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!isSysadmin(user.role)) return NextResponse.json({ error: '需要系統管理員權限' }, { status: 403 });
    if (user.congregationId) {
      return NextResponse.json({ error: '你已經加入了一個會眾' }, { status: 409 });
    }

    const congregation = await db.congregation.create({
      data: { name: name.trim(), code: slug },
    });

    const updated = await db.user.update({
      where: { id: user.id },
      data: { congregationId: congregation.id, role: 'ADMIN' },
      include: { congregation: true },
    });

    return NextResponse.json({ user: updated, congregation });
  } catch (err) {
    if (err.code === 'P2002') {
      return NextResponse.json({ error: '會眾代碼已被使用，請換一個' }, { status: 409 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
