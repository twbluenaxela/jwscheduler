import { dbErrorResponse } from '../../../../lib/apiErrors.mjs';
export const dynamic = 'force-dynamic';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../../lib/firebase-admin';
import db from '../../../../lib/db';
import { canEdit } from '../../../../lib/roles.mjs';
import { describeMidweekSlot, logChange } from '../../../../lib/changelog.mjs';
import {
  parseDuration, addMinutes, timeDifference, planPartDeletion, recomputeSectionTimes, planInsertAtStart,
} from '../../../../lib/midweekParts.mjs';

const SECTIONS = new Set(['treasures', 'ministry', 'living']);

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

function parseAdjust(raw) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > 20) return null;
  const result = [];
  for (const item of raw) {
    if (!item || typeof item.partKey !== 'string' || !item.partKey) return null;
    const match = String(item.dur ?? '').trim().match(/^\s*(\d+)\s*(?:分鐘|min)?\s*$/i);
    if (!match || Number(match[1]) < 1) return null;
    result.push({ partKey: item.partKey, dur: `${Number(match[1])} 分鐘` });
  }
  return result;
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
    // null / missing means "insert before this section's first part".
    const afterPartKey = body.afterPartKey == null || body.afterPartKey === ''
      ? null : String(body.afterPartKey);
    const title = String(body.title ?? '').trim();
    const rawDur = String(body.dur ?? '').trim();
    const numericDuration = rawDur.match(/^\s*(\d+)\s*(?:分鐘|min)?\s*$/i);
    const dur = numericDuration ? `${Number(numericDuration[1])} 分鐘` : rawDur;
    const rawTime = String(body.time ?? '').trim();
    const timeMatch = rawTime.match(/^(\d{1,2}):(\d{2})$/);
    const time = timeMatch ? `${Number(timeMatch[1])}:${timeMatch[2]}` : rawTime;
    const assignmentType = validateAssignmentType(section, body.cat, body.roleLabel ?? null);
    const adjust = parseAdjust(body.adjust);

    if (!SECTIONS.has(section)) return NextResponse.json({ error: '請選擇插入位置' }, { status: 400 });
    if (!title || title.length > 200) return NextResponse.json({ error: '請輸入節目名稱（最多 200 字）' }, { status: 400 });
    if (!dur || dur.length > 50) return NextResponse.json({ error: '請輸入節目時長' }, { status: 400 });
    if (numericDuration && Number(numericDuration[1]) < 1) return NextResponse.json({ error: '節目時長需至少 1 分鐘' }, { status: 400 });
    if (time && !/^\d{1,2}:\d{2}$/.test(time)) return NextResponse.json({ error: '時間格式請使用 8:26' }, { status: 400 });
    if (time) {
      const [hour, minute] = time.split(':').map(Number);
      if (hour < 1 || hour > 12 || minute > 59) return NextResponse.json({ error: '時間格式請使用 8:26' }, { status: 400 });
    }
    if (!assignmentType) return NextResponse.json({ error: '指派類型與節目區段不相符' }, { status: 400 });
    if (adjust === null) return NextResponse.json({ error: '時間調整資料無效' }, { status: 400 });

    const result = await db.$transaction(async (tx) => {
      const week = await tx.midweekWeek.findFirst({
        where: { id: weekId, congregationId: user.congregationId },
        include: { parts: true },
      });
      if (!week) throw new Error('找不到週次或無權限');

      const sectionParts = week.parts
        .filter((part) => part.section === section)
        .sort((a, b) => a.partNum - b.partNum);
      const insertAtStart = afterPartKey === null;
      const target = insertAtStart ? null : week.parts.find((part) => part.partKey === afterPartKey && part.section === section);
      if (!insertAtStart && !target) throw new Error('插入位置已變更，請重新整理後再試');

      let insertTime = time;
      let insertPartNum;
      if (insertAtStart) {
        const startPlan = planInsertAtStart(week, section);
        if (!startPlan) throw new Error('插入位置已變更，請重新整理後再試');
        insertPartNum = startPlan.partNum;
        if (!insertTime) insertTime = startPlan.time;
      } else {
        insertPartNum = target.partNum + 1;
      }

      const adjustMap = new Map(adjust.map((item) => [item.partKey, item.dur]));
      for (const key of adjustMap.keys()) {
        const part = week.parts.find((p) => p.partKey === key);
        if (!part || part.section !== section) throw new Error('時間調整資料無效');
      }

      // Compressed add: shorten the other parts first so the section keeps its end.
      const durById = new Map();
      for (const [key, newDur] of adjustMap) {
        const part = week.parts.find((p) => p.partKey === key);
        const updated = await tx.part.update({ where: { id: part.id }, data: { dur: newDur } });
        durById.set(part.id, updated.dur);
      }

      const laterParts = week.parts
        .filter((part) => part.partNum >= insertPartNum)
        .sort((a, b) => b.partNum - a.partNum);
      const updatesById = new Map();
      for (const part of laterParts) {
        const updated = await tx.part.update({ where: { id: part.id }, data: { partNum: { increment: 1 } } });
        updatesById.set(updated.id, {
          id: updated.id,
          partKey: updated.partKey,
          partNum: updated.partNum,
          time: updated.time ?? '',
          dur: updated.dur,
        });
      }

      const partKey = `x_${randomUUID().replaceAll('-', '')}`;
      const created = await tx.part.create({
        data: {
          weekId,
          partKey,
          section,
          partNum: insertPartNum,
          title,
          dur,
          cat: assignmentType.cat,
          roleLabel: assignmentType.roleLabel,
          time: insertTime,
        },
      });

      let createdTime = insertTime;
      let closingTime;
      let closeSongTime;

      if (adjust.length || insertAtStart) {
        // Recompute the whole section from its first part's original time
        // (the new part's own time when inserting at the very start).
        const originalFirstTime = sectionParts[0]?.time ?? '';
        const firstTime = insertAtStart ? insertTime : originalFirstTime;
        const oldEnd = recomputeSectionTimes(sectionParts, originalFirstTime).end;
        const virtualParts = sectionParts.map((part) => ({
          ...part,
          dur: durById.get(part.id) ?? part.dur,
          partNum: updatesById.get(part.id)?.partNum ?? part.partNum,
        }));
        virtualParts.push({ ...created, dur: created.dur, time: insertTime });
        const plan = recomputeSectionTimes(virtualParts, firstTime);
        for (const entry of plan.updates) {
          const updated = await tx.part.update({
            where: { id: entry.id },
            data: { time: entry.time, dur: entry.dur },
          });
          if (updated.id === created.id) createdTime = updated.time ?? '';
          updatesById.set(updated.id, {
            id: updated.id,
            partKey: updated.partKey,
            partNum: updated.partNum,
            time: updated.time ?? '',
            dur: updated.dur,
          });
        }
        if (section === 'living') {
          const delta = timeDifference(oldEnd, plan.end);
          let nextClosing = week.closingTime ?? '';
          let nextCloseSong = week.closeSongTime ?? '';
          if (delta) {
            const shiftedClosing = addMinutes(week.closingTime, delta);
            const shiftedSong = week.closeSongTime ? addMinutes(week.closeSongTime, delta) : null;
            if (shiftedClosing) {
              await tx.midweekWeek.update({
                where: { id: weekId },
                data: {
                  closingTime: shiftedClosing,
                  ...(shiftedSong ? { closeSongTime: shiftedSong } : {}),
                },
              });
              nextClosing = shiftedClosing;
              if (shiftedSong) nextCloseSong = shiftedSong;
            }
          }
          closingTime = nextClosing;
          closeSongTime = nextCloseSong;
        }
      } else {
        let cursor = insertTime ? addMinutes(insertTime, parseDuration(dur)) : null;
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
            dur: updated.dur,
          });
          cursor = addMinutes(cursor, parseDuration(part.dur));
        }

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
      }

      return {
        part: {
          id: created.partKey,
          dbId: created.id,
          time: createdTime,
          partNum: created.partNum,
          title: created.title,
          scenario: created.scenario ?? '',
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
      : err.message === '時間調整資料無效' ? 400
      : 500;
    return dbErrorResponse(err, status);
  }
}

export async function DELETE(request, context) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (!canEdit(user.role)) return NextResponse.json({ error: '訪客無法修改' }, { status: 403 });

    const { id: rawId } = await context.params;
    const weekId = Number(rawId);
    if (!Number.isInteger(weekId)) return NextResponse.json({ error: '無效的週次' }, { status: 400 });

    const partKey = String(new URL(request.url).searchParams.get('partKey') ?? '');
    if (!partKey) return NextResponse.json({ error: '缺少 partKey' }, { status: 400 });
    if (partKey === 'cbs') return NextResponse.json({ error: '會眾研經班無法刪除' }, { status: 400 });

    const result = await db.$transaction(async (tx) => {
      const week = await tx.midweekWeek.findFirst({
        where: { id: weekId, congregationId: user.congregationId },
        include: { parts: true },
      });
      if (!week) throw new Error('找不到週次或無權限');

      const part = week.parts.find((p) => p.partKey === partKey);
      if (!part) throw new Error('找不到節目');
      if (partKey === 'cbs') throw new Error('會眾研經班無法刪除');

      const plan = planPartDeletion(week, partKey);
      const prefix = `mw${week.id}_${partKey}_`;
      const assignments = await tx.assignment.findMany({
        where: { weekId: week.id, slotId: { startsWith: prefix } },
      });
      for (const assignment of assignments) {
        const slot = describeMidweekSlot(week, assignment.slotId);
        await logChange(tx, {
          congregationId: user.congregationId,
          slotId: assignment.slotId,
          date: slot?.date ?? week.date,
          label: slot?.label ?? assignment.slotId,
          prevName: assignment.name,
          name: '',
          actorName: user.displayName,
        });
      }
      await tx.assignment.deleteMany({ where: { id: { in: assignments.map((a) => a.id) } } });
      await tx.part.delete({ where: { id: part.id } });

      for (const update of plan.updates) {
        await tx.part.update({
          where: { id: update.id },
          data: { partNum: update.partNum, time: update.time },
        });
      }

      let closingTime;
      let closeSongTime;
      if (plan.closingTime !== undefined) {
        const updatedWeek = await tx.midweekWeek.update({
          where: { id: weekId },
          data: {
            closingTime: plan.closingTime,
            ...(plan.closeSongTime ? { closeSongTime: plan.closeSongTime } : {}),
          },
        });
        closingTime = updatedWeek.closingTime ?? '';
        closeSongTime = updatedWeek.closeSongTime ?? '';
      }

      return {
        ok: true,
        removedSlotIds: assignments.map((a) => a.slotId),
        updates: plan.updates,
        ...(closingTime !== undefined ? { closingTime } : {}),
        ...(closeSongTime !== undefined ? { closeSongTime } : {}),
      };
    }, { timeout: 60000, maxWait: 10000 });

    return NextResponse.json(result);
  } catch (err) {
    const status = err.message === '找不到週次或無權限' || err.message === '找不到節目' ? 404
      : err.message === '會眾研經班無法刪除' || err.message === '缺少 partKey' || err.message === '無效的週次' ? 400
      : 500;
    return dbErrorResponse(err, status);
  }
}
