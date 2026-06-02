export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { isSysadmin } from '../../../lib/roles.mjs';

// POST /api/admin/congregations  { name, code } — create a congregation (sysadmin only).
export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const actor = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!isSysadmin(actor?.role)) return NextResponse.json({ error: '需要系統管理員權限' }, { status: 403 });

    const body = await request.json();
    const name = String(body.name ?? '').trim();
    const code = String(body.code ?? '').trim().toLowerCase().replace(/\s+/g, '-');
    if (!name) return NextResponse.json({ error: '會眾名稱為必填' }, { status: 400 });
    if (!/^[a-z0-9-]{2,40}$/.test(code)) return NextResponse.json({ error: '代碼須為 2-40 個英數字或連字號' }, { status: 400 });

    const congregation = await db.congregation.create({
      data: { name, code },
      select: { id: true, name: true, code: true },
    });
    return NextResponse.json({ congregation });
  } catch (err) {
    const dup = err.code === 'P2002';
    return NextResponse.json({ error: dup ? '代碼已存在' : err.message }, { status: dup ? 409 : 500 });
  }
}
