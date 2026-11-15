export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../lib/db';
import { auth, fail, quantity, note, mapped, scoped, invalid } from '../../../../lib/literatureApi';
async function update(request, context, remove) {
  try {
    const congregationId = await auth(request);
    const existing = await scoped('literatureSubscription', (await context.params).id, congregationId);
    if (remove) { await db.literatureSubscription.delete({ where: { id: existing.id } }); return NextResponse.json({ ok: true }); }
    const body = await request.json(), data = {};
    if ('quantity' in body) data.quantity = quantity(body.quantity);
    if ('note' in body) data.note = note(body.note);
    if ('active' in body) { if (typeof body.active !== 'boolean') invalid(); data.active = body.active; }
    if ('series' in body) { if (!['w', 'wlp', 'mwb', 'g', 'wp'].includes(body.series)) invalid(); data.series = body.series; }
    if ('language' in body) { if (typeof body.language !== 'string' || !body.language.trim()) invalid(); data.language = body.language.trim(); }
    return NextResponse.json({ subscription: mapped(await db.literatureSubscription.update({ where: { id: existing.id }, data })) });
  } catch (error) { return fail(error); }
}
export async function PATCH(request, context) { return update(request, context, false); }
export async function DELETE(request, context) { return update(request, context, true); }
