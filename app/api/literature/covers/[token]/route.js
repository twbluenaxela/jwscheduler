export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../lib/db';
export async function GET(request, context) {
  try {
    const publication = await db.publication.findUnique({ where: { coverToken: (await context.params).token }, include: { cover: true } });
    if (!publication?.cover) return NextResponse.json({ error: '找不到封面' }, { status: 404 });
    return new Response(publication.cover.data, { headers: { 'Content-Type': publication.cover.mime, 'Cache-Control': 'private, max-age=31536000, immutable' } });
  } catch (err) { return NextResponse.json({ error: err.message }, { status: 500 }); }
}
