export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';

// POST /api/auth/sync
// Called on every login — upserts the User row and returns user + congregation
export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const { email, displayName } = await request.json();

    const user = await db.user.upsert({
      where: { firebaseUid: decoded.uid },
      update: { email: email ?? decoded.email, displayName: displayName ?? decoded.name },
      create: {
        firebaseUid: decoded.uid,
        email: email ?? decoded.email ?? '',
        displayName: displayName ?? decoded.name ?? null,
        role: 'MEMBER',
      },
      include: { congregation: true },
    });

    return NextResponse.json({ user });
  } catch (err) {
    console.error('[auth/sync] error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 401 });
  }
}
