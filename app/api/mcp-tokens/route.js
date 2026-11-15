export const dynamic = 'force-dynamic';
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import db from '../../lib/db';
import { verifyIdToken } from '../../lib/firebase-admin';
import { canLiterature, canEdit } from '../../lib/roles.mjs';
import { hashMcpToken } from '../../lib/mcpAuth';
import { publicOrigin } from '../../lib/publicOrigin.mjs';
import { fail, invalid } from '../../lib/literatureApi';

async function userFor(request) {
  const decoded = await verifyIdToken(request);
  const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.congregationId || !(canLiterature(user) || canEdit(user.role))) throw Object.assign(new Error('需要書刊權限'), { status: 403 });
  return user;
}
export async function GET(request) {
  try {
    const user = await userFor(request);
    const tokens = await db.mcpToken.findMany({
      where: { userId: user.id },
      select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, revokedAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ tokens });
  } catch (error) { return fail(error); }
}
export async function POST(request) {
  try {
    const user = await userFor(request);
    const { name } = await request.json();
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) invalid('請輸入連結名稱');
    const token = `jwl_${randomBytes(32).toString('base64url')}`;
    await db.mcpToken.create({ data: { userId: user.id, name: name.trim(), tokenHash: hashMcpToken(token), prefix: token.slice(0, 8) } });
    const origin = publicOrigin(request);
    return NextResponse.json({ token, url: `${origin}/api/mcp/${token}` });
  } catch (error) { return fail(error); }
}
