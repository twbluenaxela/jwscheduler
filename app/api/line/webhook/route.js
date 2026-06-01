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

function collectAssignments(name, weeks) {
  const items = [];
  for (const week of weeks) {
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

async function handleFollow(event) {
  await replyMessage(
    event.replyToken,
    '你好！這是新屋會眾的聚會排班通知帳號。\n\n請直接回覆你在排班表上的姓名，即可完成連結並接收通知。\n\n連結後，傳送「我的安排」可查詢你目前的排班。'
  );
}

async function handleMessage(event) {
  const userId = event.source?.userId;
  const text = event.message?.text?.trim();
  if (!userId || !text) return;

  // Check if querying assignments
  const isQuery = QUERY_KEYWORDS.some((kw) => text.includes(kw));
  if (isQuery) {
    const person = await db.person.findFirst({ where: { lineUserId: userId } });
    if (!person) {
      await replyMessage(event.replyToken, '你尚未連結帳號。請傳送你在排班表上的姓名以完成連結。');
      return;
    }
    const weeks = await db.midweekWeek.findMany({
      where: { congregationId: person.congregationId },
      orderBy: { id: 'asc' },
      include: { parts: true, assignments: true },
    });
    const items = collectAssignments(person.name, weeks);
    if (!items.length) {
      await replyMessage(event.replyToken, `${person.name}，目前你沒有排定的安排。`);
    } else {
      const list = items.map((i) => `▸ ${i.date}  ${i.role}`).join('\n');
      await replyMessage(event.replyToken, `${person.name}，你目前的安排（共 ${items.length} 項）：\n\n${list}`);
    }
    return;
  }

  // Already linked?
  const existing = await db.person.findFirst({ where: { lineUserId: userId } });
  if (existing) {
    await replyMessage(event.replyToken, `✓ 你已連結為「${existing.name}」。\n\n傳送「我的安排」可查詢你目前的排班。`);
    return;
  }

  // Try name-based linking
  const person = await db.person.findFirst({ where: { name: text, status: 'active' } });
  if (!person) {
    await replyMessage(event.replyToken, `找不到「${text}」。請確認姓名是否與排班表上完全一致，或聯絡管理員。`);
    return;
  }

  await db.person.update({ where: { id: person.id }, data: { lineUserId: userId } });
  await replyMessage(event.replyToken, `✓ 已連結！${person.name}，你將收到後續的排班通知。\n\n傳送「我的安排」可隨時查詢你的排班。`);
}

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
