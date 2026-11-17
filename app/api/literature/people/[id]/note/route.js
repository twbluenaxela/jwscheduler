export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../../lib/db';
import { auth, fail, invalid, scoped } from '../../../../../lib/literatureApi';

export async function PATCH(request, context) {
  try {
    const congregationId = await auth(request);
    const person = await scoped('person', (await context.params).id, congregationId);
    const body = await request.json();
    const replace = Object.hasOwn(body, 'note');
    const append = Object.hasOwn(body, 'append');
    if (replace === append) invalid();
    let literatureNote;
    if (replace) {
      if (body.note !== null && typeof body.note !== 'string') invalid();
      literatureNote = body.note?.trim() || null;
    } else {
      if (typeof body.append !== 'string' || !body.append.trim()) invalid();
      const date = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric',
      }).formatToParts(new Date());
      const part = (type) => date.find((item) => item.type === type).value;
      const prefix = `${part('year')}/${part('month')}/${part('day')}：`;
      literatureNote = [person.literatureNote, prefix + body.append.trim()].filter(Boolean).join('\n');
    }
    if (literatureNote?.length > 1000) invalid('書刊備註不可超過 1000 個字');
    const updated = await db.person.update({ where: { id: person.id }, data: { literatureNote } });
    return NextResponse.json({ literatureNote: updated.literatureNote });
  } catch (error) {
    return fail(error);
  }
}
