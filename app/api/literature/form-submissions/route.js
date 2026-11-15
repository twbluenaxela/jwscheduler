export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../lib/db';
import { auth, fail, mapped, invalid } from '../../../lib/literatureApi';

export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const params = new URL(request.url).searchParams;
    const archived = params.get('archived') ?? '0';
    const limit = Number(params.get('limit') ?? 20);
    if (!['0', '1'].includes(archived) || !Number.isInteger(limit) || limit < 1 || limit > 100) invalid();
    const rows = await db.literatureFormSubmission.findMany({ where: { congregationId, archivedAt: archived === '1' ? { not: null } : null }, include: { person: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: limit });
    return NextResponse.json(mapped({ submissions: rows.map(({ person, ...row }) => ({ ...row, personName: person?.name || row.guestName })) }));
  } catch (error) { return fail(error); }
}
