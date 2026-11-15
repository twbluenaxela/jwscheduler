export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../../../lib/db';
import { auth, fail, id, invalid, mapped } from '../../../../../../lib/literatureApi';
import { getCount, nonnegative } from '../../../../../../lib/inventoryServer';

export async function PATCH(request, context) {
  try {
    const params = await context.params;
    const count = await getCount(params.id, await auth(request));
    const line = await db.inventoryLine.findFirst({ where: { id: id(params.lineId), countId: count.id } });
    if (!line) throw Object.assign(new Error('找不到資料'), { status: 404 });
    const body = await request.json();
    const data = {};
    if ('onHand' in body) data.onHand = body.onHand === null ? null : nonnegative(body.onHand);
    if ('opening' in body) data.opening = nonnegative(body.opening);
    if (!Object.keys(data).length) invalid();
    return NextResponse.json(mapped({ line: await db.inventoryLine.update({ where: { id: line.id }, data }) }));
  } catch (error) { return fail(error); }
}
