export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';

function mapPart(part, weekId, assignmentMap) {
  const slotBase = `mw${weekId}_${part.partKey}`;
  const assign = [
    assignmentMap.get(`${slotBase}_0`),
    assignmentMap.get(`${slotBase}_1`),
  ].filter(Boolean);

  return {
    id: part.partKey,
    dbId: part.id,
    time: part.time ?? '',
    partNum: part.partNum,
    title: part.title,
    dur: part.dur,
    cat: part.cat,
    roleLabel: part.roleLabel ?? undefined,
    cbsRef: part.cbsRef ?? undefined,
    assign,
  };
}

function mapWeek(week) {
  const sections = { treasures: [], ministry: [], living: [] };
  const assignmentMap = new Map((week.assignments ?? []).map((assignment) => [assignment.slotId, assignment.name]));
  for (const part of week.parts ?? []) {
    const section = sections[part.section] ? part.section : 'living';
    sections[section].push(mapPart(part, week.id, assignmentMap));
  }

  return {
    id: week.id,
    date: week.date,
    dateLabel: week.dateLabel ?? undefined,
    weekStart: week.weekStart ?? undefined,
    weekdayPill: week.weekdayPill,
    reading: week.reading,
    chairman: assignmentMap.get(`mw${week.id}_chairman`) ?? '',
    openPrayer: assignmentMap.get(`mw${week.id}_openPrayer`) ?? '',
    openSong: week.openSong,
    openIntroTime: week.openIntroTime ?? '',
    treasures: sections.treasures,
    ministry: sections.ministry,
    midSong: week.midSong,
    midSongTime: week.midSongTime ?? '',
    living: sections.living,
    closingTime: week.closingTime ?? '',
    closingDur: week.closingDur ?? '',
    closeSongTime: week.closeSongTime ?? '',
    closeSong: week.closeSong,
    closePrayer: assignmentMap.get(`mw${week.id}_closePrayer`) ?? '',
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

function mapWeekendRow(row) {
  return {
    _id: row.id,
    date: row.date,
    type: row.type,
    no: row.no ?? '',
    topic: row.topic ?? '',
    cong: row.cong ?? '',
    speaker: row.speaker ?? '',
    chair: row.chair ?? '',
    wt: row.wt ?? '',
    read: row.read ?? '',
    host: row.host ?? '',
    away: row.away ?? '',
    label: row.label ?? '',
    note: row.note ?? '',
  };
}

export async function GET(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) {
      return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    }

    const congregation = await db.congregation.findUnique({
      where: { id: user.congregationId },
      include: {
        people: { orderBy: [{ status: 'asc' }, { name: 'asc' }] },
        weeks: {
          orderBy: { id: 'asc' },
          include: {
            parts: { orderBy: [{ section: 'asc' }, { partNum: 'asc' }] },
            assignments: true,
          },
        },
        weekendRows: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
      },
    });

    return NextResponse.json({
      congregation: {
        id: congregation.id,
        name: congregation.name,
        code: congregation.code,
        meetingDayOffset: congregation.meetingDayOffset,
        meetingTime: congregation.meetingTime,
        exceptions: congregation.exceptions,
      },
      people: congregation.people.map(mapPerson),
      midweekWeeks: congregation.weeks.map(mapWeek),
      weekendRows: congregation.weekendRows.map(mapWeekendRow),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
