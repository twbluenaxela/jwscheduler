export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../lib/db';
import { auth, fail, id, quantity, note, status, mapped, scoped } from '../../../../lib/literatureApi';
async function update(request, context, remove) {
  try {
    const congregationId = await auth(request);
    const existing = await scoped('literatureRequest', (await context.params).id, congregationId);
    const body = remove ? { status: 'cancelled' } : await request.json();
    const data = {};
    if ('personId' in body) {
      data.personId = id(body.personId);
      await scoped('person', data.personId, congregationId);
      data.guestName = null;
      data.guestNote = null;
    }
    if ('quantity' in body) data.quantity = quantity(body.quantity);
    if ('note' in body) data.note = note(body.note);
    if ('status' in body) { data.status = status(body.status); data.deliveredAt = data.status === 'delivered' ? (existing.deliveredAt ?? new Date()) : null; }
    return NextResponse.json({ request: mapped(await db.literatureRequest.update({ where: { id: existing.id }, data })) });
  } catch (error) { return fail(error); }
}
export async function PATCH(request, context) { return update(request, context, false); }
export async function DELETE(request, context) { return update(request, context, true); }
