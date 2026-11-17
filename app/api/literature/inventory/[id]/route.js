export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../lib/db';
import { auth, fail, invalid, mapped, note } from '../../../../lib/literatureApi';
import { getCount, refreshLines } from '../../../../lib/inventoryServer';

export async function GET(request, context) {
  try {
    const count = await getCount((await context.params).id, await auth(request));
    return NextResponse.json(mapped({ count, lines: await refreshLines(count) }));
  } catch (error) { return fail(error); }
}
export async function PATCH(request, context) {
  try {
    const count = await getCount((await context.params).id, await auth(request));
    const body = await request.json();
    const data = {};
    if ('status' in body) {
      if (!['draft', 'done'].includes(body.status)) invalid('狀態無效');
      if (count.status === 'draft' && body.status === 'done') {
        await refreshLines(count);
        data.completedAt = new Date();
      } else if (count.status === 'done' && body.status === 'draft') {
        data.completedAt = null;
      }
      data.status = body.status;
    }
    if ('note' in body) data.note = note(body.note);
    return NextResponse.json(mapped({ count: await db.inventoryCount.update({ where: { id: count.id }, data }) }));
  } catch (error) { return fail(error); }
}
export async function DELETE(request, context) {
  try {
    const count = await getCount((await context.params).id, await auth(request));
    if (count.status !== 'draft') invalid('只能刪除草稿');
    await db.inventoryCount.delete({ where: { id: count.id } });
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error); }
}
