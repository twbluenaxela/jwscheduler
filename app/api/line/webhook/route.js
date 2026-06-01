export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import db from '../../../lib/db';

function verifySignature(rawBody, signature) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) return false;
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  return hash === signature;
}

async function replyMessage(replyToken, text) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
}

function parseCnDate(dateStr) {
  const m = String(dateStr ?? '').match(/(\d+)月\s*(\d+)日/);
  if (!m) return null;
  const now = new Date();
  let year = now.getFullYear();
  const mo = parseInt(m[1]);
  if (mo < now.getMonth() + 1 - 6) year++;
  else if (mo > now.getMonth() + 1 + 6) year--;
  return new Date(year, mo - 1, parseInt(m[2]));
}

function collectAssignments(name, weeks) {
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
  return items;
}

const QUERY_KEYWORDS = ['我的安排', '查詢', '安排', '節目', 'schedule', 'assignment'];

// ── Step 1: Follow event ──────────────────────────────────────────────────────
async function handleFollow(event) {
  await replyMessage(
    event.replyToken,
    '你好！歡迎加入聚會排班通知服務。\n\n請先回覆你所屬的會眾名稱，例如：新屋'
  );
}

// ── Step 2 / Query: Handle text messages ──────────────────────────────────────
async function handleMessage(event) {
  const userId = event.source?.userId;
  const text = event.message?.text?.trim();
  if (!userId || !text) return;

  // ── Already linked ──────────────────────────────────────────────────────────
  const linked = await db.person.findFirst({
    where: { lineUserId: userId },
    include: { congregation: { select: { name: true } } },
  });

  if (linked) {
    const isQuery = QUERY_KEYWORDS.some((kw) => text.includes(kw));
    if (isQuery) {
      const weeks = await db.midweekWeek.findMany({
        where: { congregationId: linked.congregationId },
        orderBy: { id: 'asc' },
        include: { parts: true, assignments: true },
      });
      const items = collectAssignments(linked.name, weeks);
      if (!items.length) {
        await replyMessage(event.replyToken, `${linked.name}，目前你沒有排定的安排。`);
      } else {
        const list = items.map((i) => `▸ ${i.date}  ${i.role}`).join('\n');
        await replyMessage(event.replyToken, `${linked.name}，你目前的安排（共 ${items.length} 項）：\n\n${list}`);
      }
    } else {
      await replyMessage(event.replyToken, `✓ 你已連結為「${linked.name}」（${linked.congregation.name}）。\n\n傳送「我的安排」可查詢你目前的排班。`);
    }
    return;
  }

  // ── Pending: waiting for name ───────────────────────────────────────────────
  const pending = await db.linePendingLink.findUnique({ where: { lineUserId: userId } });

  if (pending) {
    const person = await db.person.findFirst({
      where: { name: text, congregationId: pending.congregationId, status: 'active' },
      include: { congregation: { select: { name: true } } },
    });
    if (!person) {
      await replyMessage(event.replyToken, `在該會眾中找不到「${text}」。請確認姓名是否與排班表完全一致，或傳送會眾代碼重新選擇。`);
      return;
    }
    // Link and clean up pending state
    await Promise.all([
      db.person.update({ where: { id: person.id }, data: { lineUserId: userId } }),
      db.linePendingLink.delete({ where: { lineUserId: userId } }),
    ]);
    await replyMessage(event.replyToken, `✓ 連結成功！${person.name}（${person.congregation.name}），你將收到後續的排班通知。\n\n傳送「我的安排」可隨時查詢你的排班。`);
    return;
  }

  // ── No state: match congregation by code (exact) or name ──────────────────
  // Try code first (exact, case-insensitive), then name with priority:
  // exact → starts-with → contains.
  // Code lookup lets users resolve ambiguous name matches cleanly.
  let cong = await db.congregation.findFirst({
    where: { code: { equals: text, mode: 'insensitive' } },
  });

  if (!cong) {
    let matches = await db.congregation.findMany({
      where: { name: { equals: text, mode: 'insensitive' } },
    });
    if (!matches.length) {
      matches = await db.congregation.findMany({
        where: { name: { startsWith: text, mode: 'insensitive' } },
      });
    }
    if (!matches.length) {
      matches = await db.congregation.findMany({
        where: { name: { contains: text, mode: 'insensitive' } },
      });
    }

    if (matches.length === 0) {
      await replyMessage(event.replyToken, `找不到「${text}」相關的會眾。\n\n請再試一次，或聯絡管理員確認會眾名稱。`);
      return;
    }

    if (matches.length > 1) {
      const list = matches.map(c => `・${c.name}\n  代碼：${c.code}`).join('\n');
      await replyMessage(event.replyToken, `找到多個符合的會眾：\n\n${list}\n\n請直接回覆會眾代碼以確認選擇。`);
      return;
    }

    cong = matches[0];
  }
  // Store pending congregation, ask for name
  await db.linePendingLink.upsert({
    where: { lineUserId: userId },
    update: { congregationId: cong.id },
    create: { lineUserId: userId, congregationId: cong.id },
  });
  await replyMessage(event.replyToken, `已選擇「${cong.name}」（代碼：${cong.code}）。\n\n請回覆你在排班表上的姓名：`);
}

// ── Router ────────────────────────────────────────────────────────────────────
export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-line-signature') ?? '';

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }

  for (const event of payload.events ?? []) {
    if (event.type === 'follow') await handleFollow(event);
    else if (event.type === 'message' && event.message?.type === 'text') await handleMessage(event);
  }

  return NextResponse.json({ ok: true });
}
