export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../lib/firebase-admin';
import db from '../../lib/db';

function personPayload(body) {
  return {
    name: String(body.name ?? '').trim(),
    gender: body.g ?? body.gender ?? 'M',
    appointment: body.appt ?? body.appointment ?? '',
    tags: Array.isArray(body.quals) ? body.quals : (Array.isArray(body.tags) ? body.tags : []),
    status: body.status ?? 'active',
    awayNote: body.awayNote || null,
  };
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
    lineUserId: person.lineUserId ?? '',
    recent: [],
  };
}

export async function GET(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });

    const people = await db.person.findMany({
      where: { congregationId: user.congregationId },
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });

    return NextResponse.json({ people: people.map(mapPerson) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });

    const data = personPayload(await request.json());
    if (!data.name) return NextResponse.json({ error: '姓名為必填' }, { status: 400 });

    const person = await db.person.create({
      data: { ...data, congregationId: user.congregationId },
    });

    return NextResponse.json({ person: mapPerson(person) });
  } catch (err) {
    const status = err.code === 'P2002' ? 409 : 500;
    return NextResponse.json({ error: err.code === 'P2002' ? '人員姓名已存在' : err.message }, { status });
  }
}
