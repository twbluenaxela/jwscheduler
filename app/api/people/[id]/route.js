export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';

function personPayload(body) {
  const data = {};
  if ('name' in body) data.name = String(body.name ?? '').trim();
  if ('g' in body || 'gender' in body) data.gender = body.g ?? body.gender;
  if ('appt' in body || 'appointment' in body) data.appointment = body.appt ?? body.appointment ?? '';
  if ('quals' in body || 'tags' in body) data.tags = Array.isArray(body.quals) ? body.quals : (Array.isArray(body.tags) ? body.tags : []);
  if ('status' in body) data.status = body.status ?? 'active';
  if ('awayNote' in body) data.awayNote = body.awayNote || null;
  return data;
}

function mapPerson(person) {
  return {
    id: String(person.id),
    name: person.name,
    g: person.gender,
    appt: person.appointment || '傳道員',
    quals: person.tags ?? [],
    status: person.status,
    awayNote: person.awayNote ?? '',
    recent: [],
  };
}

export async function PATCH(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });

    const params = await context.params;
    const id = Number(params.id);
    const existing = await db.person.findFirst({
      where: { id, congregationId: user.congregationId },
    });
    if (!existing) return NextResponse.json({ error: '找不到人員' }, { status: 404 });

    const data = personPayload(await request.json());
    if ('name' in data && !data.name) return NextResponse.json({ error: '姓名為必填' }, { status: 400 });

    const person = await db.person.update({ where: { id }, data });
    return NextResponse.json({ person: mapPerson(person) });
  } catch (err) {
    const status = err.code === 'P2002' ? 409 : 500;
    return NextResponse.json({ error: err.code === 'P2002' ? '人員姓名已存在' : err.message }, { status });
  }
}
