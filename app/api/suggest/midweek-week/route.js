export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { suggestMidweekWeek } from '../../../lib/suggest';
import { partTypeOf, slotCat } from '../../../lib/partTypes.mjs';

const ROLE_TO_CAT = { chairman: 'chairman', openPrayer: 'prayer', closePrayer: 'prayer' };

export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });

    const { weekId, assignments: existingAssignments = {} } = await request.json();
    if (!weekId) return NextResponse.json({ error: '缺少 weekId' }, { status: 400 });

    const congId = user.congregationId;

    const [targetWeek, historyWeeks, people] = await Promise.all([
      db.midweekWeek.findFirst({
        where: { id: weekId, congregationId: congId },
        include: { parts: { orderBy: [{ section: 'asc' }, { partNum: 'asc' }] } },
      }),
      db.midweekWeek.findMany({
        where: { congregationId: congId, id: { not: weekId } },
        include: { parts: true, assignments: true },
      }),
      db.person.findMany({ where: { congregationId: congId, status: 'active' } }),
    ]);

    if (!targetWeek) return NextResponse.json({ error: '找不到週次' }, { status: 404 });

    // Normalise week to frontend shape (parts use partKey as .id)
    const sections = { treasures: [], ministry: [], living: [] };
    for (const part of targetWeek.parts) {
      const s = sections[part.section] ? part.section : 'living';
      sections[s].push({ id: part.partKey, cat: part.cat, roleLabel: part.roleLabel ?? '', title: part.title });
    }
    const week = { id: targetWeek.id, ...sections };

    // Build pastHistory: [{ name, cat, date, type, role, pairId }]
    const pastHistory = [];
    for (const w of historyWeeks) {
      const partMap = new Map(w.parts.map(p => [p.partKey, p]));
      for (const a of w.assignments) {
        const roleMatch = a.slotId.match(/^mw\d+_(chairman|openPrayer|closePrayer)$/);
        if (roleMatch) {
          pastHistory.push({ name: a.name, cat: ROLE_TO_CAT[roleMatch[1]], date: w.date });
          continue;
        }
        const partMatch = a.slotId.match(/^mw\d+_(.+?)_([01])$/);
        if (partMatch) {
          const part = partMap.get(partMatch[1]);
          // pairId groups the two halves of one pair-capable part so the
          // engine can recover 學生／助手 pairings (who served WITH whom).
          if (part) pastHistory.push({
            name: a.name,
            cat: slotCat(part, partMatch[2]),
            date: w.date,
            type: part.cat === 'ministry' ? partTypeOf(part.title) : null,
            role: partMatch[2],
            pairId: String(part.roleLabel ?? '').includes('/') ? `${w.id}_${partMatch[1]}` : null,
          });
        }
      }
    }

    const normalPeople = people.map(p => ({
      name: p.name, g: p.gender, quals: p.tags ?? [], status: p.status,
    }));

    // refDate = the target week's meeting date. historyWeeks includes FUTURE
    // weeks too — the engine's bidirectional gap uses them so a person already
    // booked in an upcoming week is not suggested for this one.
    const suggestions = suggestMidweekWeek(normalPeople, week, existingAssignments, pastHistory, targetWeek.date);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
