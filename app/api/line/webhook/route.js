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

async function handleFollow(event) {
  await replyMessage(
    event.replyToken,
    '你好！這是新屋會眾的聚會排班通知帳號。\n\n請直接回覆你在排班表上的姓名，即可完成連結並接收通知。'
  );
}

async function handleMessage(event) {
  const userId = event.source?.userId;
  const text = event.message?.text?.trim();
  if (!userId || !text) return;

  // Check if already linked
  const existing = await db.person.findFirst({ where: { lineUserId: userId } });
  if (existing) {
    await replyMessage(event.replyToken, `✓ 你已連結為「${existing.name}」，將會收到排班通知。`);
    return;
  }

  // Try to match by name across all congregations
  const person = await db.person.findFirst({
    where: { name: text, status: 'active' },
  });

  if (!person) {
    await replyMessage(
      event.replyToken,
      `找不到「${text}」。請確認姓名是否與排班表上完全一致，或聯絡管理員。`
    );
    return;
  }

  await db.person.update({ where: { id: person.id }, data: { lineUserId: userId } });
  await replyMessage(event.replyToken, `✓ 已連結！${person.name}，你將收到後續的排班通知。`);
}

export async function POST(request) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-line-signature') ?? '';

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  for (const event of payload.events ?? []) {
    if (event.type === 'follow') await handleFollow(event);
    else if (event.type === 'message' && event.message?.type === 'text') await handleMessage(event);
  }

  return NextResponse.json({ ok: true });
}
