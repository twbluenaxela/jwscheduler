export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../../lib/db';
import { auth, fail, id, mapped, scoped } from '../../../../../lib/literatureApi';
import { countData, getCount } from '../../../../../lib/inventoryServer';

export async function POST(request, context) {
  try {
    const congregationId = await auth(request);
    const count = await getCount((await context.params).id, congregationId);
    const publicationId = id((await request.json()).publicationId);
    await scoped('publication', publicationId, congregationId);
    const data = await countData(congregationId, count.month);
    const opening = data.previousLines.find((line) => line.publicationId === publicationId)?.onHand ?? 0;
    const line = await db.inventoryLine.create({ data: { countId: count.id, publicationId, opening, received: data.received.get(publicationId) || 0 } });
    return NextResponse.json(mapped({ line }));
  } catch (error) { return fail(error); }
}
