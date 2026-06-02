export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';
import { parseCnDate, collectAssignments, itemKey } from '../../../lib/assignments.mjs';

function buildMessage(name, current, previous) {
  const header = `【新屋會眾 · 聚會節目通知】\n${name}，你好！`;

  // First time — send full list
  if (previous === null) {
    if (!current.length) return null; // no assignments, skip
    const list = current.map((i) => `▸ ${i.date}  ${i.role}`).join('\n');
    return `${header}\n\n以下是你目前的安排（共 ${current.length} 項）：\n\n${list}\n\n如有疑問請聯絡編排負責人。`;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const prevFuture = previous.filter((i) => { const d = parseCnDate(i.date); return d && d >= today; });

  const curSet = new Set(current.map(itemKey));
  const prevSet = new Set(prevFuture.map(itemKey));
  const added = current.filter((i) => !prevSet.has(itemKey(i)));
  const removed = prevFuture.filter((i) => !curSet.has(itemKey(i)));

  if (!added.length && !removed.length) return null; // no changes, skip

  const lines = [`${header}\n\n你的安排有更新：`];
  if (added.length) {
    lines.push('\n新增：');
    added.forEach((i) => lines.push(`  ✚ ${i.date}  ${i.role}`));
  }
  if (removed.length) {
    lines.push('\n取消：');
    removed.forEach((i) => lines.push(`  ✖ ${i.date}  ${i.role}`));
  }
  lines.push('\n如有疑問請聯絡編排負責人。');
  return lines.join('\n');
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

    const [congregation, weeks, weekendRows, people] = await Promise.all([
      db.congregation.findUnique({ where: { id: congId }, select: { publishedSnapshot: true } }),
      db.midweekWeek.findMany({
        where: { congregationId: congId },
        orderBy: { id: 'asc' },
        include: { parts: true, assignments: true },
      }),
      db.weekendRow.findMany({
        where: { congregationId: congId },
        orderBy: { sortOrder: 'asc' },
      }),
      db.person.findMany({
        where: { congregationId: congId, lineUserId: { not: null }, status: 'active' },
      }),
    ]);

    const prevSnapshot = (congregation.publishedSnapshot ?? null);
    const newSnapshot = {};
    let sent = 0, failed = 0, skipped = 0;
    const errors = [];

    for (const person of people) {
      const current = collectAssignments(person.name, weeks, weekendRows);
      newSnapshot[person.name] = current;
      const previous = prevSnapshot ? (prevSnapshot[person.name] ?? []) : null;
      const text = buildMessage(person.name, current, previous);
      if (!text) { skipped++; continue; }
      try {
        await pushLineMessage(person.lineUserId, text);
        sent++;
      } catch (err) {
        failed++;
        errors.push(`${person.name}: ${err.message}`);
      }
    }

    // Save new snapshot
    await db.congregation.update({
      where: { id: congId },
      data: { publishedSnapshot: newSnapshot },
    });

    return NextResponse.json({ sent, failed, skipped, total: people.length, errors });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
