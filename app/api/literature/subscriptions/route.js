export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../lib/db';
import { auth, fail, id, quantity, note, mapped, scoped, invalid } from '../../../lib/literatureApi';
export async function POST(request) {
  try {
    const congregationId = await auth(request), body = await request.json();
    const personId = id(body.personId);
    await scoped('person', personId, congregationId);
    if (!['w', 'wlp', 'mwb', 'g', 'wp'].includes(body.series) || typeof (body.language ?? 'CHT') !== 'string' || !(body.language ?? 'CHT').trim()) invalid();
    const series = body.series, language = (body.language ?? 'CHT').trim();
    const data = { quantity: quantity(body.quantity ?? 1), note: note(body.note), active: true };
    const subscription = await db.literatureSubscription.upsert({ where: { personId_series_language: { personId, series, language } }, create: { congregationId, personId, series, language, ...data }, update: data });
    return NextResponse.json({ subscription: mapped(subscription) });
  } catch (error) { return fail(error); }
}
