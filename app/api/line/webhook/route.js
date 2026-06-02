export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import db from '../../../lib/db';
import { handleFollow, handleMessage } from '../../../lib/line-webhook.mjs';

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

  const deps = { db, reply: replyMessage };
  for (const event of payload.events ?? []) {
    if (event.type === 'follow') await handleFollow(event, deps);
    else if (event.type === 'message' && event.message?.type === 'text') await handleMessage(event, deps);
  }

  return NextResponse.json({ ok: true });
}
