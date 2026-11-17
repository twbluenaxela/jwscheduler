export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../lib/db';
import { mapPublication, withCoverFallback } from '../../../lib/literature.mjs';
import { auth, fail, mapped, invalid } from '../../../lib/literatureApi';

export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const params = new URL(request.url).searchParams;
    const archived = params.get('archived') ?? '0';
    const limit = Number(params.get('limit') ?? 20);
    if (!['0', '1'].includes(archived) || !Number.isInteger(limit) || limit < 1 || limit > 100) invalid();
    const rows = await db.literatureFormSubmission.findMany({ where: { congregationId, archivedAt: archived === '1' ? { not: null } : null }, include: { person: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: limit });
    const ids = [...new Set(rows.flatMap((row) => row.items.map((item) => Number(item.publicationId))).filter(Number.isSafeInteger))];
    const publications = await db.publication.findMany({ where: { congregationId, id: { in: ids } } });
    const covers = withCoverFallback(publications.map(mapPublication));
    const submissions = rows.map(({ person, ...row }) => ({
      ...row,
      personName: person?.name || row.guestName,
      items: row.items.map((item) => {
        const publication = covers.find((pub) => String(pub.id) === String(item.publicationId));
        return publication ? { ...item, code: publication.code, language: publication.language,
          format: publication.format, coverUrl: publication.coverUrl } : item;
      }),
    }));
    return NextResponse.json(mapped({ submissions }));
  } catch (error) { return fail(error); }
}
