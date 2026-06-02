export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { canEdit } from '../../../lib/roles.mjs';

const MAX_WEEKS = 40;
const MAX_PARTS_PER_WEEK = 80;
const SECTIONS = ['treasures', 'ministry', 'living'];
const CATS = ['treasures', 'gems', 'reading', 'ministry', 'living', 'cbs'];

function cleanText(value, max = 240) {
  return String(value ?? '').replace(/\0/g, '').trim().slice(0, max);
}

function cleanPart(part, section, index) {
  const partKey = cleanText(part.id || `${section}-${index}`, 40);
  const cat = CATS.includes(part.cat) ? part.cat : section;
  return {
    partKey,
    section,
    partNum: Number.isFinite(Number(part.partNum)) ? Number(part.partNum) : index + 1,
    title: cleanText(part.title, 500),
    dur: cleanText(part.dur, 80),
    cat,
    roleLabel: part.roleLabel ? cleanText(part.roleLabel, 80) : null,
    time: part.time ? cleanText(part.time, 40) : null,
    cbsRef: part.cbsRef ? cleanText(part.cbsRef, 500) : null,
  };
}

function cleanWeek(week) {
  const date = cleanText(week.date, 80);
  if (!date) throw new Error('每一週都需要日期');

  const parts = SECTIONS.flatMap((section) => {
    const sectionParts = Array.isArray(week[section]) ? week[section] : [];
    return sectionParts.map((part, index) => cleanPart(part, section, index));
  });

  if (parts.length > MAX_PARTS_PER_WEEK) {
    throw new Error('單週節目項目過多');
  }

  return {
    week: {
      date,
      dateLabel: week.dateLabel ? cleanText(week.dateLabel, 120) : null,
      weekStart: week.weekStart ? cleanText(week.weekStart, 80) : null,
      weekdayPill: cleanText(week.weekdayPill || '星期三 · 19:30', 120),
      reading: cleanText(week.reading, 240),
      openSong: cleanText(week.openSong, 40),
      midSong: cleanText(week.midSong, 40),
      closeSong: cleanText(week.closeSong, 40),
      openSongTime: week.openSongTime ? cleanText(week.openSongTime, 40) : null,
      midSongTime: week.midSongTime ? cleanText(week.midSongTime, 40) : null,
      closeSongTime: week.closeSongTime ? cleanText(week.closeSongTime, 40) : null,
      openIntroTime: week.openIntroTime ? cleanText(week.openIntroTime, 40) : null,
      closingTime: week.closingTime ? cleanText(week.closingTime, 40) : null,
      closingDur: week.closingDur ? cleanText(week.closingDur, 80) : null,
    },
    parts,
  };
}

function mapPart(part, weekId, assignmentMap) {
  const slotBase = `mw${weekId}_${part.partKey}`;
  const s0 = assignmentMap.get(`${slotBase}_0`) ?? '';
  const s1 = assignmentMap.get(`${slotBase}_1`) ?? '';
  const assign = part.roleLabel?.includes('/') ? [s0, s1] : (s0 ? [s0] : []);

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

export async function POST(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) {
      return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    }
    if (!canEdit(user.role)) return NextResponse.json({ error: '訪客無法修改' }, { status: 403 });

    const body = await request.json();
    const weeksInput = Array.isArray(body.weeks) ? body.weeks : [];
    if (!weeksInput.length) return NextResponse.json({ error: '沒有可匯入的週次' }, { status: 400 });
    if (weeksInput.length > MAX_WEEKS) return NextResponse.json({ error: '一次匯入的週次過多' }, { status: 400 });

    const cleaned = weeksInput.map(cleanWeek);
    const savedIds = await db.$transaction(async (tx) => {
      const ids = [];

      for (const item of cleaned) {
        const existing = await tx.midweekWeek.findFirst({
          where: {
            congregationId: user.congregationId,
            OR: [
              ...(item.week.weekStart ? [{ weekStart: item.week.weekStart }] : []),
              { date: item.week.date },
            ],
          },
          orderBy: { id: 'asc' },
        });

        const week = existing
          ? await tx.midweekWeek.update({
              where: { id: existing.id },
              data: item.week,
            })
          : await tx.midweekWeek.create({
              data: { ...item.week, congregationId: user.congregationId },
            });

        const incomingKeys = item.parts.map((part) => part.partKey);
        await tx.part.deleteMany({
          where: {
            weekId: week.id,
            partKey: { notIn: incomingKeys.length ? incomingKeys : [''] },
          },
        });

        for (const part of item.parts) {
          await tx.part.upsert({
            where: { weekId_partKey: { weekId: week.id, partKey: part.partKey } },
            update: part,
            create: { ...part, weekId: week.id },
          });
        }

        ids.push(week.id);
      }

      return ids;
    }, 
    {
      maxWait: 5000,
      timeout: 30000,
    }
  );

    const weeks = await db.midweekWeek.findMany({
      where: { id: { in: savedIds }, congregationId: user.congregationId },
      orderBy: { id: 'asc' },
      include: {
        parts: { orderBy: [{ section: 'asc' }, { partNum: 'asc' }] },
        assignments: true,
      },
    });

    return NextResponse.json({ weeks: weeks.map(mapWeek) });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
