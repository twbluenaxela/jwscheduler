import { dbErrorResponse } from '../../../lib/apiErrors.mjs';
export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { suggestMidweekWeek } from '../../../lib/suggest';
import { buildSuggestPastHistory } from '../../../lib/suggestHistory.mjs';

export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });

    const { weekId, assignments: existingAssignments = {} } = await request.json();
    if (!weekId) return NextResponse.json({ error: '缺少 weekId' }, { status: 400 });

    const congId = user.congregationId;

    const [targetWeek, historyWeeks, weekendRows, people] = await Promise.all([
      db.midweekWeek.findFirst({
        where: { id: weekId, congregationId: congId },
        include: { parts: { orderBy: [{ section: 'asc' }, { partNum: 'asc' }] } },
      }),
      db.midweekWeek.findMany({
        where: { congregationId: congId, id: { not: weekId } },
        include: { parts: true, assignments: true },
      }),
      db.weekendRow.findMany({
        where: { congregationId: congId, type: { notIn: ['event', 'suspended'] } },
      }),
      db.person.findMany({ where: { congregationId: congId, status: 'active' } }),
    ]);

    if (!targetWeek) return NextResponse.json({ error: '找不到週次' }, { status: 404 });

    // Normalise week to frontend shape (parts use partKey as .id)
    const sections = { treasures: [], ministry: [], living: [] };
    for (const part of targetWeek.parts) {
      const s = sections[part.section] ? part.section : 'living';
      sections[s].push({
        id: part.partKey, cat: part.cat, roleLabel: part.roleLabel ?? '', title: part.title,
        hideHelper: part.hideHelper ?? false,
      });
    }
    const week = { id: targetWeek.id, ...sections };

    // Build pastHistory: [{ name, cat, date, type, role, pairId }]
    const pastHistory = buildSuggestPastHistory(historyWeeks);

    const normalPeople = people.map(p => ({
      name: p.name,
      g: p.gender,
      quals: p.tags ?? [],
      status: p.status,
      assignmentNote: p.assignmentNote ?? '',
      assignmentIntervalMonths: p.assignmentIntervalMonths ?? 0,
    }));

    // Preferred assignment intervals apply across every kind of assignment,
    // not only the category currently being filled. Include weekend service in
    // the all-role history used solely for that preference.
    const allHistory = [...pastHistory];
    for (const row of weekendRows) {
      for (const name of [row.speaker, row.chair, row.wt, row.read, row.host]) {
        if (name) allHistory.push({ name, date: row.date, isoDate: row.isoDate });
      }
    }

    // refDate = the target week's meeting date. historyWeeks includes FUTURE
    // weeks too — the engine's bidirectional gap uses them so a person already
    // booked in an upcoming week is not suggested for this one.
    const suggestions = suggestMidweekWeek(
      normalPeople,
      week,
      existingAssignments,
      pastHistory,
      targetWeek.date,
      allHistory,
    );
    return NextResponse.json({ suggestions });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
