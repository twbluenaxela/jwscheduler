export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';

function parseCnDate(dateStr) {
  const text = String(dateStr ?? '');
  const cn = text.match(/(\d+)月\s*(\d+)日/);
  if (cn) {
    const now = new Date();
    let year = now.getFullYear();
    const mo = parseInt(cn[1]);
    if (mo < now.getMonth() + 1 - 6) year++;
    else if (mo > now.getMonth() + 1 + 6) year--;
    return new Date(year, mo - 1, parseInt(cn[2]));
  }
  const slash = text.match(/^(\d+)\/(\d+)$/);
  if (slash) {
    const now = new Date();
    let year = now.getFullYear();
    const mo = parseInt(slash[1]);
    if (mo < now.getMonth() + 1 - 6) year++;
    else if (mo > now.getMonth() + 1 + 6) year--;
    return new Date(year, mo - 1, parseInt(slash[2]));
  }
  return null;
}

function collectAssignments(name, weeks, weekendRows) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const items = [];

  for (const week of weeks) {
    const d = parseCnDate(week.date);
    if (!d || d < today) continue;
    const aMap = new Map(week.assignments.map((a) => [a.slotId, a.name]));
    if (aMap.get(`mw${week.id}_chairman`) === name) items.push({ date: week.date, role: '主席' });
    if (aMap.get(`mw${week.id}_openPrayer`) === name) items.push({ date: week.date, role: '開始禱告' });
    if (aMap.get(`mw${week.id}_closePrayer`) === name) items.push({ date: week.date, role: '結束禱告' });
    for (const part of week.parts) {
      if (aMap.get(`mw${week.id}_${part.partKey}_0`) === name) items.push({ date: week.date, role: part.title });
      if (aMap.get(`mw${week.id}_${part.partKey}_1`) === name) items.push({ date: week.date, role: `${part.title}（助手）` });
    }
  }

  for (const row of weekendRows) {
    if (row.type === 'event') continue;
    const d = parseCnDate(row.date);
    if (!d || d < today) continue;
    if (row.speaker === name) items.push({ date: row.date, role: '公眾演講' });
    if (row.chair === name) items.push({ date: row.date, role: '主席' });
    if (row.wt === name) items.push({ date: row.date, role: '守望台主持' });
    if (row.read === name) items.push({ date: row.date, role: '朗讀' });
    if (row.host === name) items.push({ date: row.date, role: '招待' });
  }

  items.sort((a, b) => (parseCnDate(a.date) ?? 0) - (parseCnDate(b.date) ?? 0));
  return items;
}

function itemKey(item) { return `${item.date}|${item.role}`; }

// Every name holding a future assignment — used so the saved snapshot covers
// everyone (not just LINE-linked people), keeping the changes-diff accurate.
function collectAssignedNames(weeks, weekendRows) {
  const names = new Set();
  for (const week of weeks) {
    for (const a of week.assignments) if (a.name) names.add(a.name);
  }
  for (const row of weekendRows) {
    if (row.type === 'event') continue;
    for (const f of ['speaker', 'chair', 'wt', 'read', 'host']) {
      if (row[f]) names.add(row[f]);
    }
  }
  return names;
}

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

    // Fill the snapshot for everyone else who holds an assignment (no LINE link),
    // so the group-wide changes diff (meetings/changes) has a complete baseline.
    for (const name of collectAssignedNames(weeks, weekendRows)) {
      if (newSnapshot[name] === undefined) {
        newSnapshot[name] = collectAssignments(name, weeks, weekendRows);
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
