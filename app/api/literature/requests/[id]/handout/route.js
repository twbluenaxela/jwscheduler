export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../../lib/db';
import { auth, fail, scoped, invalid, mapped } from '../../../../../lib/literatureApi';

async function update(request, context, delivered) {
  try {
    const congregationId = await auth(request);
    const row = await scoped('literatureRequest', (await context.params).id, congregationId);
    if (row.personId !== null) invalid('此操作僅適用於名單外申請');
    if (row.status !== (delivered ? 'received' : 'delivered')) invalid('申請狀態無效');
    const updated = await db.literatureRequest.update({ where: { id: row.id }, data: { status: delivered ? 'delivered' : 'received', deliveredAt: delivered ? new Date() : null } });
    return NextResponse.json({ request: mapped(updated) });
  } catch (error) { return fail(error); }
}
export async function POST(request, context) { return update(request, context, true); }
export async function DELETE(request, context) { return update(request, context, false); }
