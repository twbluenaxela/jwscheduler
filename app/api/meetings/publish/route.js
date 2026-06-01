export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';

function collectAssignments(name, weeks) {
  const items = [];
  for (const week of weeks) {
    const aMap = new Map(week.assignments.map((a) => [a.slotId, a.name]));
    const chairman = aMap.get(`mw${week.id}_chairman`) ?? '';
    const openPrayer = aMap.get(`mw${week.id}_openPrayer`) ?? '';
    const closePrayer = aMap.get(`mw${week.id}_closePrayer`) ?? '';

    if (chairman === name) items.push({ date: week.date, role: '主席' });
    if (openPrayer === name) items.push({ date: week.date, role: '開始禱告' });
    if (closePrayer === name) items.push({ date: week.date, role: '結束禱告' });

    for (const part of week.parts) {
      const p0 = aMap.get(`mw${week.id}_${part.partKey}_0`) ?? '';
      const p1 = aMap.get(`mw${week.id}_${part.partKey}_1`) ?? '';
      if (p0 === name) items.push({ date: week.date, role: part.title });
      if (p1 === name) items.push({ date: week.date, role: `${part.title}（助手）` });
    }
  }
  return items;
}

function buildMessage(name, items) {
  const header = `【新屋會眾 · 聚會節目通知】\n${name}，你好！`;
  if (items.length === 0) {
    return `${header}\n\n目前你沒有排定的安排。\n如有疑問請聯絡編排負責人。`;
  }
  const list = items.map((item) => `▸ ${item.date}  ${item.role}`).join('\n');
  return `${header}\n\n以下是你的安排（共 ${items.length} 項）：\n\n${list}\n\n如有疑問請聯絡編排負責人。`;
}

async function pushLineMessage(lineUserId, text) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `LINE API ${res.status}`);
  }
}

export async function POST(request) {
  try {
    if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
      return NextResponse.json({ error: 'LINE 通知尚未設定' }, { status: 503 });
    }

    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (user.role !== 'ADMIN') return NextResponse.json({ error: '需要管理員權限' }, { status: 403 });

    const congId = user.congregationId;

    const [weeks, people] = await Promise.all([
      db.midweekWeek.findMany({
        where: { congregationId: congId },
        orderBy: { id: 'asc' },
        include: { parts: true, assignments: true },
      }),
      db.person.findMany({
        where: { congregationId: congId, lineUserId: { not: null }, status: 'active' },
      }),
    ]);

    let sent = 0;
    let failed = 0;
    const errors = [];

    for (const person of people) {
      try {
        const items = collectAssignments(person.name, weeks);
        const text = buildMessage(person.name, items);
        await pushLineMessage(person.lineUserId, text);
        sent++;
      } catch (err) {
        failed++;
        errors.push(`${person.name}: ${err.message}`);
      }
    }

    return NextResponse.json({ sent, failed, total: people.length, errors });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
