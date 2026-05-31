export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';

export async function PATCH(request) {
  try {
    const decoded = await verifyIdToken(request);
    const { displayName } = await request.json();

    if (typeof displayName !== 'string' || !displayName.trim()) {
      return NextResponse.json({ error: '顯示名稱不得為空' }, { status: 400 });
    }

    const user = await db.user.update({
      where: { firebaseUid: decoded.uid },
      data: { displayName: displayName.trim() },
    });

    return NextResponse.json({ user: { id: user.id, displayName: user.displayName, email: user.email, role: user.role, congregationId: user.congregationId } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
