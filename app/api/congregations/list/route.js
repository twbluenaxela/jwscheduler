export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';

// GET /api/congregations/list — congregations to choose from at sign-up.
// Auth required (logged in) but no congregation needed yet. Only non-sensitive
// fields (id, name, code).
export async function GET(request) {
  try {
    await verifyIdToken(request);
    const congregations = await db.congregation.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, code: true },
    });
    return NextResponse.json({ congregations });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
