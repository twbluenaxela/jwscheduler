import { dbErrorResponse } from '../../../../lib/apiErrors.mjs';
export const dynamic = 'force-dynamic';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../../lib/firebase-admin';
import db from '../../../../lib/db';
import { canLiterature } from '../../../../lib/roles.mjs';
import { mapPublication } from '../../../../lib/literature.mjs';
async function update(request, context, remove) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 400 });
    if (!canLiterature(user)) return NextResponse.json({ error: '需要書刊權限' }, { status: 403 });
    const id = Number((await context.params).id);
    const existing = Number.isInteger(id) && await db.publication.findFirst({ where: { id, congregationId: user.congregationId } });
    if (!existing) return NextResponse.json({ error: '找不到書刊' }, { status: 404 });
    let mime, data;
    if (!remove) {
      mime = request.headers.get('content-type');
      if (!['image/jpeg','image/png','image/webp'].includes(mime)) return NextResponse.json({ error: '不支援的圖片格式' }, { status: 400 });
      data = Buffer.from(await request.arrayBuffer());
      if (data.length > 200 * 1024) return NextResponse.json({ error: '圖片不得超過 200 KB' }, { status: 413 });
    }
    const publication = await db.$transaction(async tx => {
      if (remove) await tx.publicationCover.deleteMany({ where: { publicationId: id } });
      else await tx.publicationCover.upsert({ where: { publicationId: id }, create: { publicationId: id, mime, data }, update: { mime, data } });
      return tx.publication.update({ where: { id }, data: { coverToken: remove ? null : randomUUID() } });
    }, { timeout: 60000, maxWait: 10000 });
    return NextResponse.json({ publication: mapPublication(publication) });
  } catch (err) { return dbErrorResponse(err); }
}
export async function PUT(request, context) { return update(request, context, false); }
export async function DELETE(request, context) { return update(request, context, true); }
