import { dbErrorResponse } from '../../lib/apiErrors.mjs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../lib/firebase-admin';
import db from '../../lib/db';
import { canLiterature } from '../../lib/roles.mjs';
import { seedRowsFor, sortPublications, mapPublication, publicationPayload } from '../../lib/literature.mjs';
import { publicOrigin } from '../../lib/publicOrigin.mjs';
import seed from '../../data/literature-seed.json';

export async function GET(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 400 });
    if (!canLiterature(user)) return NextResponse.json({ error: '需要書刊權限' }, { status: 403 });
    const where = { congregationId: user.congregationId };
    if (await db.publication.count({ where }) === 0) await db.publication.createMany({ data: seedRowsFor(user.congregationId, seed), skipDuplicates: true });
    const [publications, congregation] = await Promise.all([
      db.publication.findMany({ where }),
      db.congregation.findUnique({ where: { id: user.congregationId }, select: { literatureFormToken: true } }),
    ]);
    const formToken = congregation?.literatureFormToken || null;
    return NextResponse.json({ publications: sortPublications(publications).map(mapPublication), formToken, formUrl: formToken ? `${publicOrigin(request)}/r/${formToken}` : null });
  } catch (err) { return dbErrorResponse(err); }
}
export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 400 });
    if (!canLiterature(user)) return NextResponse.json({ error: '需要書刊權限' }, { status: 403 });
    let data;
    try { data = publicationPayload(await request.json()); } catch (err) { return NextResponse.json({ error: err.message }, { status: 400 }); }
    const publication = await db.publication.create({ data: { ...data, congregationId: user.congregationId } });
    return NextResponse.json({ publication: mapPublication(publication) });
  } catch (err) { return err.code === 'P2002' ? NextResponse.json({ error: '已有相同代號、語言與格式的書刊' }, { status: 409 }) : dbErrorResponse(err); }
}
