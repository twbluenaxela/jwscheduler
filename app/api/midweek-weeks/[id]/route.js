export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { canEdit } from '../../../lib/roles.mjs';
import { parseCnDate, parseIsoDate, toIsoDate } from '../../../lib/cnDate.mjs';

const WEEK_FIELDS = new Set([
  'date', 'dateLabel', 'weekdayPill', 'reading',
  'openSong', 'midSong', 'closeSong',
  'openIntroTime', 'midSongTime', 'closingTime', 'closingDur', 'closeSongTime',
  'type', 'label',
]);

export async function PATCH(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canEdit(user.role)) return NextResponse.json({ error: '訪客無法修改' }, { status: 403 });

    const params = await context.params;
    const id = Number(params.id);
    const existing = await db.midweekWeek.findFirst({
      where: { id, congregationId: user.congregationId },
    });
    if (!existing) return NextResponse.json({ error: '找不到週次' }, { status: 404 });

    const body = await request.json();

    const weekData = {};
    for (const [key, val] of Object.entries(body)) {
      if (!WEEK_FIELDS.has(key)) continue;
      if (key === 'label') { weekData.label = val || null; }         // empty string → null
      else if (key === 'type') { weekData.type = val || 'normal'; }  // always has a value
      else weekData[key] = val ?? '';
    }

    // Keep the real date in step with an edited display date, anchored on the
    // week's own current date so an edit stays in that week's year.
    if ('date' in weekData) {
      const anchor = parseIsoDate(existing.isoDate) ?? new Date();
      const resolved = parseCnDate(weekData.date, anchor);
      weekData.isoDate = resolved ? toIsoDate(resolved) : null;
    }

    const parts = Array.isArray(body.parts) ? body.parts : [];

    await db.$transaction([
      ...(Object.keys(weekData).length
        ? [db.midweekWeek.update({ where: { id }, data: weekData })]
        : []),
      ...parts.map((p) =>
        db.part.update({
          where: { id: Number(p.id) },
          data: {
            ...(p.title      !== undefined ? { title:      p.title      } : {}),
            ...(p.dur        !== undefined ? { dur:        p.dur        } : {}),
            ...(p.time       !== undefined ? { time:       p.time       } : {}),
            ...(p.hideHelper !== undefined ? { hideHelper: !!p.hideHelper } : {}),
            ...(p.roleLabel  !== undefined ? { roleLabel:  p.roleLabel   } : {}),
          },
        })
      ),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canEdit(user.role)) return NextResponse.json({ error: '訪客無法修改' }, { status: 403 });

    const params = await context.params;
    const id = Number(params.id);
    const existing = await db.midweekWeek.findFirst({
      where: { id, congregationId: user.congregationId },
    });
    if (!existing) return NextResponse.json({ error: '找不到週次' }, { status: 404 });

    await db.midweekWeek.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
