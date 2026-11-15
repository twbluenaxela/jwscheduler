export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { canLiterature } from '../../../lib/roles.mjs';
import { mapPublication, publicationPayload } from '../../../lib/literature.mjs';
async function update(request, context, remove) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 400 });
    if (!canLiterature(user)) return NextResponse.json({ error: '需要書刊權限' }, { status: 403 });
    const id = Number((await context.params).id);
    const existing = Number.isInteger(id) && await db.publication.findFirst({ where: { id, congregationId: user.congregationId } });
    if (!existing) return NextResponse.json({ error: '找不到書刊' }, { status: 404 });
    let data;
    try { data = remove ? { active: false } : publicationPayload(await request.json(), true); } catch (err) { return NextResponse.json({ error: err.message }, { status: 400 }); }
    const publication = await db.publication.update({ where: { id }, data });
    return NextResponse.json({ publication: mapPublication(publication) });
  } catch (err) { return NextResponse.json({ error: err.code === 'P2002' ? '已有相同代號、語言與格式的書刊' : err.message }, { status: err.code === 'P2002' ? 409 : 500 }); }
}
export async function PATCH(request, context) { return update(request, context, false); }
export async function DELETE(request, context) { return update(request, context, true); }
