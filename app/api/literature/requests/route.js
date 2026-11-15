export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../lib/db';
import { auth, fail, id, quantity, note, status, mapped, scoped } from '../../../lib/literatureApi';
export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const [subscriptions, requests] = await Promise.all([
      db.literatureSubscription.findMany({ where: { congregationId } }),
      db.literatureRequest.findMany({ where: { congregationId, OR: [{ status: { notIn: ['cancelled', 'delivered'] } }, { status: 'delivered', deliveredAt: { gte: new Date(Date.now() - 60 * 86400000) } }] } }),
    ]);
    return NextResponse.json(mapped({ subscriptions, requests }));
  } catch (error) { return fail(error); }
}
export async function POST(request) {
  try {
    const congregationId = await auth(request);
    const body = await request.json();
    const personId = id(body.personId), publicationId = id(body.publicationId);
    await scoped('person', personId, congregationId);
    await scoped('publication', publicationId, congregationId);
    const state = status(body.status ?? 'pending');
    const item = await db.literatureRequest.create({ data: { congregationId, personId, publicationId, quantity: quantity(body.quantity ?? 1), note: note(body.note), status: state, deliveredAt: state === 'delivered' ? new Date() : null } });
    return NextResponse.json({ request: mapped(item) });
  } catch (error) { return fail(error); }
}
