export const dynamic = 'force-dynamic';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import db from '../../../lib/db';
import { auth, fail } from '../../../lib/literatureApi';
import { publicOrigin } from '../../../lib/publicOrigin.mjs';

export async function POST(request) {
  try {
    const congregationId = await auth(request);
    const token = randomUUID();
    await db.congregation.update({ where: { id: congregationId }, data: { literatureFormToken: token } });
    return NextResponse.json({ token, url: `${publicOrigin(request)}/r/${token}` });
  } catch (error) { return fail(error); }
}
export async function DELETE(request) {
  try {
    const congregationId = await auth(request);
    await db.congregation.update({ where: { id: congregationId }, data: { literatureFormToken: null } });
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error); }
}
