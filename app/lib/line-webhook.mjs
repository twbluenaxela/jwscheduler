// Framework-free LINE webhook handlers. `db` (Prisma client) and `reply`
// (replyToken, text) → Promise are injected so these can be unit-tested with an
// in-memory fake DB and a reply spy — no network, no Prisma singleton. The route
// file owns signature verification, the real reply call, and HTTP plumbing.

import { collectAssignments } from './assignments.mjs';

export const QUERY_KEYWORDS = ['我的安排', '查詢安排', '安排查詢', '節目查詢'];
export const HELP_KEYWORDS = ['說明', '幫助', '指令', 'help', '?', '？'];

export const HELP_LINKED = `📋 可用指令：

▸ 我的安排 — 查詢你目前所有未來排班
▸ 說明 — 顯示此說明

收到排班通知後如有疑問，請聯絡編排負責人。`;

export const HELP_UNLINKED = `📋 使用說明：

尚未完成連結。請按照以下步驟：

1️⃣ 傳送你所屬的會眾名稱
   例如：新屋

2️⃣ 再傳送你在排班表上的姓名
   例如：王大明

完成後即可收到排班通知，並可隨時傳送「我的安排」查詢。

如有問題請聯絡編排負責人。`;

// ── Step 1: Follow event ──────────────────────────────────────────────────────
export async function handleFollow(event, { reply }) {
  await reply(
    event.replyToken,
    '你好！歡迎加入聚會排班通知服務。\n\n請先回覆你所屬的會眾名稱，例如：新屋'
  );
}

// ── Step 2 / Query: Handle text messages ──────────────────────────────────────
export async function handleMessage(event, { db, reply, now }) {
  const userId = event.source?.userId;
  const text = event.message?.text?.trim();
  if (!userId || !text) return;

  // ── Already linked ──────────────────────────────────────────────────────────
  const linked = await db.person.findFirst({
    where: { lineUserId: userId },
    include: { congregation: { select: { name: true } } },
  });

  if (linked) {
    const isHelp = HELP_KEYWORDS.some((kw) => text === kw);
    const isQuery = QUERY_KEYWORDS.some((kw) => text.includes(kw));
    if (isHelp) {
      await reply(event.replyToken, HELP_LINKED);
    } else if (isQuery) {
      const [weeks, weekendRows] = await Promise.all([
        db.midweekWeek.findMany({
          where: { congregationId: linked.congregationId },
          orderBy: { id: 'asc' },
          include: { parts: true, assignments: true },
        }),
        db.weekendRow.findMany({
          where: { congregationId: linked.congregationId },
          orderBy: { sortOrder: 'asc' },
        }),
      ]);
      const items = collectAssignments(linked.name, weeks, weekendRows, { skipSuspended: true, now });
      if (!items.length) {
        await reply(event.replyToken, `${linked.name}，目前你沒有排定的安排。`);
      } else {
        const list = items.map((i) => `▸ ${i.date}  ${i.role}`).join('\n');
        await reply(event.replyToken, `${linked.name}，你目前的安排（共 ${items.length} 項）：\n\n${list}`);
      }
    } else {
      await reply(event.replyToken, `✓ 你已連結為「${linked.name}」（${linked.congregation.name}）。\n\n傳送「我的安排」查詢排班，或傳送「說明」查看可用指令。`);
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
      await reply(event.replyToken, `在該會眾中找不到「${text}」。請確認姓名是否與排班表完全一致，或傳送會眾代碼重新選擇。`);
      return;
    }
    await Promise.all([
      db.person.update({ where: { id: person.id }, data: { lineUserId: userId } }),
      db.linePendingLink.delete({ where: { lineUserId: userId } }),
    ]);
    await reply(event.replyToken, `✓ 連結成功！${person.name}（${person.congregation.name}），你將收到後續的排班通知。\n\n傳送「我的安排」可隨時查詢你的排班。`);
    return;
  }

  // ── Help for unlinked users ────────────────────────────────────────────────
  if (HELP_KEYWORDS.some((kw) => text === kw)) {
    await reply(event.replyToken, HELP_UNLINKED);
    return;
  }

  // ── No state: match congregation by code (exact) or name ──────────────────
  // Code first (exact, case-insensitive), then name: exact → starts-with → contains.
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
      await reply(event.replyToken, `找不到「${text}」相關的會眾。\n\n請再試一次，或聯絡管理員確認會眾名稱。`);
      return;
    }

    if (matches.length > 1) {
      const list = matches.map((c) => `・${c.name}\n  代碼：${c.code}`).join('\n');
      await reply(event.replyToken, `找到多個符合的會眾：\n\n${list}\n\n請直接回覆會眾代碼以確認選擇。`);
      return;
    }

    cong = matches[0];
  }

  await db.linePendingLink.upsert({
    where: { lineUserId: userId },
    update: { congregationId: cong.id },
    create: { lineUserId: userId, congregationId: cong.id },
  });
  await reply(event.replyToken, `已選擇「${cong.name}」（代碼：${cong.code}）。\n\n請回覆你在排班表上的姓名：`);
}
