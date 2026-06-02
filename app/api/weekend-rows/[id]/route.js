export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { WEEKEND_NAME_FIELDS, weekendFieldLabel, logChange } from '../../../lib/changelog.mjs';

const ALLOWED_FIELDS = new Set(['speaker', 'chair', 'wt', 'read', 'host', 'away', 'topic', 'no', 'cong', 'note', 'label', 'date']);

export async function DELETE(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });

    const params = await context.params;
    const id = Number(params.id);
    const existing = await db.weekendRow.findFirst({
      where: { id, congregationId: user.congregationId },
    });
    if (!existing) return NextResponse.json({ error: '找不到週末排程' }, { status: 404 });

    await db.weekendRow.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });

    const params = await context.params;
    const id = Number(params.id);
    const existing = await db.weekendRow.findFirst({
      where: { id, congregationId: user.congregationId },
    });
    if (!existing) return NextResponse.json({ error: '找不到週末排程' }, { status: 404 });

    const body = await request.json();
    const data = {};
    for (const [key, val] of Object.entries(body)) {
      if (ALLOWED_FIELDS.has(key)) data[key] = val ?? '';
    }
    if (!Object.keys(data).length) return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 });

    const row = await db.weekendRow.update({ where: { id }, data });

    // Log assignment (name-field) changes for 總覽 ▸ 最近變更.
    for (const field of WEEKEND_NAME_FIELDS) {
      if (field in data) {
        await logChange(db, {
          congregationId: user.congregationId,
          slotId: `we${id}_${field}`,
          date: row.date,
          label: weekendFieldLabel(field),
          prevName: existing[field] ?? '',
          name: data[field] ?? '',
          actorName: user.displayName,
        });
      }
    }

    return NextResponse.json({ ok: true, row });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
