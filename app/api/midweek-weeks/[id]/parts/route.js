export const dynamic = 'force-dynamic';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../../lib/firebase-admin';
import db from '../../../../lib/db';
import { canEdit } from '../../../../lib/roles.mjs';

const SECTIONS = new Set(['treasures', 'ministry', 'living']);

function parseDuration(value) {
  const match = String(value ?? '').match(/^\s*(\d+)\s*(?:分鐘|min)?\s*$/i);
  return match ? Number(match[1]) : null;
}

function addMinutes(time, minutes) {
  const match = String(time ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !Number.isFinite(minutes)) return null;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const total = hour * 60 + minute + minutes;
  const nextHour = (((Math.floor(total / 60) - 1) % 12) + 12) % 12 + 1;
  const nextMinute = ((total % 60) + 60) % 60;
  return `${nextHour}:${String(nextMinute).padStart(2, '0')}`;
}

function timeDifference(from, to) {
  const asMinutes = (value) => {
    const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = asMinutes(from);
  const end = asMinutes(to);
  if (start === null || end === null) return null;
  let difference = end - start;
  if (difference > 360) difference -= 720;
  if (difference < -360) difference += 720;
  return difference;
}

function validateAssignmentType(section, cat, roleLabel) {
  if (section === 'living') return cat === 'living' && !roleLabel ? { cat, roleLabel: null } : null;
  if (section === 'treasures') {
    if (cat === 'reading') return roleLabel === '學生' ? { cat, roleLabel } : null;
    if (cat === 'treasures' || cat === 'gems') return !roleLabel ? { cat, roleLabel: null } : null;
    return null;
  }
  if (section === 'ministry') {
    if (cat === 'ministrytalk') return roleLabel === '學生' ? { cat, roleLabel } : null;
    if (cat === 'ministry' && ['學生', '學生/助手'].includes(roleLabel)) return { cat, roleLabel };
  }
  return null;
}

export async function POST(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canEdit(user.role)) return NextResponse.json({ error: '訪客無法修改' }, { status: 403 });

    const { id: rawId } = await context.params;
    const weekId = Number(rawId);
    if (!Number.isInteger(weekId)) return NextResponse.json({ error: '無效的週次' }, { status: 400 });

    const body = await request.json();
    const section = String(body.section ?? '');
    const afterPartKey = String(body.afterPartKey ?? '');
    const title = String(body.title ?? '').trim();
    const rawDur = String(body.dur ?? '').trim();
    const numericDuration = rawDur.match(/^\s*(\d+)\s*(?:分鐘|min)?\s*$/i);
    const dur = numericDuration ? `${Number(numericDuration[1])} 分鐘` : rawDur;
    const rawTime = String(body.time ?? '').trim();
    const timeMatch = rawTime.match(/^(\d{1,2}):(\d{2})$/);
    const time = timeMatch ? `${Number(timeMatch[1])}:${timeMatch[2]}` : rawTime;
    const assignmentType = validateAssignmentType(section, body.cat, body.roleLabel ?? null);

    if (!SECTIONS.has(section) || !afterPartKey) return NextResponse.json({ error: '請選擇插入位置' }, { status: 400 });
    if (!title || title.length > 200) return NextResponse.json({ error: '請輸入節目名稱（最多 200 字）' }, { status: 400 });
    if (!dur || dur.length > 50) return NextResponse.json({ error: '請輸入節目時長' }, { status: 400 });
    if (numericDuration && Number(numericDuration[1]) < 1) return NextResponse.json({ error: '節目時長需至少 1 分鐘' }, { status: 400 });
    if (time && !/^\d{1,2}:\d{2}$/.test(time)) return NextResponse.json({ error: '時間格式請使用 8:26' }, { status: 400 });
    if (time) {
      const [hour, minute] = time.split(':').map(Number);
      if (hour < 1 || hour > 12 || minute > 59) return NextResponse.json({ error: '時間格式請使用 8:26' }, { status: 400 });
    }
    if (!assignmentType) return NextResponse.json({ error: '指派類型與節目區段不相符' }, { status: 400 });

    const result = await db.$transaction(async (tx) => {
      const week = await tx.midweekWeek.findFirst({
        where: { id: weekId, congregationId: user.congregationId },
        include: { parts: true },
      });
      if (!week) throw new Error('找不到週次或無權限');

      const target = week.parts.find((part) => part.partKey === afterPartKey && part.section === section);
      if (!target) throw new Error('插入位置已變更，請重新整理後再試');

      const laterParts = week.parts
        .filter((part) => part.partNum > target.partNum)
        .sort((a, b) => b.partNum - a.partNum);
      const updatesById = new Map();
      for (const part of laterParts) {
        const updated = await tx.part.update({ where: { id: part.id }, data: { partNum: { increment: 1 } } });
        updatesById.set(updated.id, {
          id: updated.id,
          partKey: updated.partKey,
          partNum: updated.partNum,
          time: updated.time ?? '',
        });
      }

      const partKey = `x_${randomUUID().replaceAll('-', '')}`;
      const created = await tx.part.create({
        data: {
          weekId,
          partKey,
          section,
          partNum: target.partNum + 1,
          title,
          dur,
          cat: assignmentType.cat,
          roleLabel: assignmentType.roleLabel,
          time,
        },
      });

      let cursor = time ? addMinutes(time, parseDuration(dur)) : null;
      const sectionLaterParts = week.parts
        .filter((part) => part.section === section && part.partNum > target.partNum)
        .sort((a, b) => a.partNum - b.partNum);
      for (const part of sectionLaterParts) {
        if (!cursor) break;
        const updated = await tx.part.update({ where: { id: part.id }, data: { time: cursor } });
        updatesById.set(updated.id, {
          id: updated.id,
          partKey: updated.partKey,
          partNum: updated.partNum,
          time: updated.time ?? '',
        });
        cursor = addMinutes(cursor, parseDuration(part.dur));
      }

      let closingTime;
      let closeSongTime;
      if (section === 'living' && cursor) {
        const closingDelta = timeDifference(week.closingTime, cursor);
        const nextCloseSongTime = closingDelta !== null && week.closeSongTime
          ? addMinutes(week.closeSongTime, closingDelta)
          : null;
        const updatedWeek = await tx.midweekWeek.update({
          where: { id: weekId },
          data: {
            closingTime: cursor,
            ...(nextCloseSongTime ? { closeSongTime: nextCloseSongTime } : {}),
          },
        });
        closingTime = updatedWeek.closingTime ?? '';
        closeSongTime = updatedWeek.closeSongTime ?? '';
      }

      return {
        part: {
          id: created.partKey,
          dbId: created.id,
          time: created.time ?? '',
          partNum: created.partNum,
          title: created.title,
          dur: created.dur,
          cat: created.cat,
          roleLabel: created.roleLabel ?? undefined,
          hideHelper: false,
          assign: [],
        },
        updates: [...updatesById.values()],
        ...(closingTime !== undefined ? { closingTime } : {}),
        ...(closeSongTime !== undefined ? { closeSongTime } : {}),
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const status = err.message === '找不到週次或無權限' ? 404
      : err.message === '插入位置已變更，請重新整理後再試' ? 409
      : 500;
    return NextResponse.json({ error: err.message }, { status });
  }
}
