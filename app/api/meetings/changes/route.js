export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { verifyIdToken } from '../../../lib/firebase-admin';
import db from '../../../lib/db';

// Mirror of meetings/publish parseCnDate — handles "6月 3日" and slash "8/9".
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

// Same shape as meetings/publish collectAssignments — future-only items for one person.
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

  return items;
}

function itemKey(item) { return `${item.date}|${item.role}`; }

// Every name that currently holds a future assignment.
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

function buildChangesText(added, removed) {
  const lines = ['【聚會節目更新】'];
  if (added.length) {
    lines.push('', '新增：');
    added.forEach((i) => lines.push(`  ✚ ${i.date}  ${i.role} — ${i.name}`));
  }
  if (removed.length) {
    lines.push('', '取消：');
    removed.forEach((i) => lines.push(`  ✖ ${i.date}  ${i.role} — ${i.name}`));
  }
  return lines.join('\n');
}

export async function GET(request) {
  try {
    const decoded = await verifyIdToken(request);
    const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user?.congregationId) return NextResponse.json({ error: '未加入會眾' }, { status: 403 });
    if (user.role !== 'ADMIN') return NextResponse.json({ error: '需要管理員權限' }, { status: 403 });

    const congId = user.congregationId;
    const [congregation, weeks, weekendRows] = await Promise.all([
      db.congregation.findUnique({ where: { id: congId }, select: { publishedSnapshot: true } }),
      db.midweekWeek.findMany({
        where: { congregationId: congId },
        orderBy: { id: 'asc' },
        include: { parts: true, assignments: true },
      }),
      db.weekendRow.findMany({ where: { congregationId: congId }, orderBy: { sortOrder: 'asc' } }),
    ]);

    const prevSnapshot = congregation.publishedSnapshot ?? null;
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Diff every name that appears in the current schedule OR the previous snapshot.
    const names = collectAssignedNames(weeks, weekendRows);
    if (prevSnapshot) Object.keys(prevSnapshot).forEach((n) => names.add(n));

    const added = [];
    const removed = [];
    for (const name of names) {
      const current = collectAssignments(name, weeks, weekendRows);
      if (prevSnapshot === null) {
        current.forEach((i) => added.push({ ...i, name }));
        continue;
      }
      const prevFuture = (prevSnapshot[name] ?? []).filter((i) => {
        const d = parseCnDate(i.date); return d && d >= today;
      });
      const curSet = new Set(current.map(itemKey));
      const prevSet = new Set(prevFuture.map(itemKey));
      current.filter((i) => !prevSet.has(itemKey(i))).forEach((i) => added.push({ ...i, name }));
      prevFuture.filter((i) => !curSet.has(itemKey(i))).forEach((i) => removed.push({ ...i, name }));
    }

    const byDate = (a, b) => (parseCnDate(a.date) ?? 0) - (parseCnDate(b.date) ?? 0);
    added.sort(byDate);
    removed.sort(byDate);

    const hasBaseline = prevSnapshot !== null;
    const text = (added.length || removed.length) ? buildChangesText(added, removed) : '';
    return NextResponse.json({ text, addedCount: added.length, removedCount: removed.length, hasBaseline });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
