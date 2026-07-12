/**
 * Import July 2026 midweek schedule: weeks, parts, and assignments.
 * Run with: node --env-file=.env scripts/import-july-2026.mjs
 *
 * Safe to re-run — upserts on date/weekStart for weeks, partKey for parts,
 * and slotId for assignments.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Schedule data ─────────────────────────────────────────────────────────────
// Part keys follow epubParser convention:
//   t0/t1/t2   = treasures parts
//   m0/m1/m2   = ministry parts
//   l0         = living talk
//   cbs        = 會眾研經班 (always keyed "cbs")
// roleLabel '學生/助手' or '主持/朗讀' = pair slot (_0 + _1)
// roleLabel '學生' or null            = single slot (_0 only)

const WEEKS = [
  {
    date: '7月 9日',
    weekStart: '7月 6日',
    dateLabel: '7月6-12日',
    weekdayPill: '星期四 · 19:30',
    reading: '耶利米書13－15章',
    openSong: '123', openSongTime: '7:30',
    openIntroTime: '7:36',
    midSong: '49', midSongTime: '8:15',
    closeSong: '61', closeSongTime: '9:08',
    closingTime: '9:05', closingDur: '不超過3分鐘',
    chairman: '廖永田',
    openPrayer: '羅紫軒',
    closePrayer: '張嘉成',
    treasures: [
      { key: 't0', partNum: 1, title: '服從耶和華是天經地義的', dur: '10分鐘', cat: 'treasures', time: '7:36', a0: '楊家松' },
      { key: 't1', partNum: 2, title: '經文寶石', dur: '10分鐘', cat: 'gems', time: '7:46', a0: '包恩德' },
      { key: 't2', partNum: 3, title: '經文朗讀', dur: '4分鐘', cat: 'reading', roleLabel: '學生', time: '7:56', a0: '黃志強' },
    ],
    ministry: [
      { key: 'm0', partNum: 4, title: '初次交談 — 向住戶作見證', dur: '3分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:00', a0: '黃圓妹', a1: '陳芝吟' },
      { key: 'm1', partNum: 5, title: '再次交談 — 在日常生活中作見證', dur: '4分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:04', a0: '羅辰恩', a1: '吳佩姍' },
      { key: 'm2', partNum: 6, title: '演講 — 《愛心》附錄A第18點', dur: '5分鐘', cat: 'ministry', roleLabel: '學生', time: '8:09', a0: '廖子君' },
    ],
    living: [
      { key: 'l0', partNum: 7, title: '「服從勝過獻祭」', dur: '15分鐘', cat: 'living', time: '8:20', a0: '周業邦' },
      { key: 'cbs', partNum: 8, title: '會眾研經班', dur: '30分鐘', cat: 'cbs', roleLabel: '主持/朗讀', time: '8:35', a0: '鄭裕人', a1: '林睿穩' },
    ],
  },
  {
    date: '7月 16日',
    weekStart: '7月 13日',
    dateLabel: '7月13-19日',
    weekdayPill: '星期四 · 19:30',
    reading: '耶利米書16－17章',
    openSong: '34', openSongTime: '7:30',
    openIntroTime: '7:36',
    midSong: '54', midSongTime: '8:15',
    closeSong: '22', closeSongTime: '9:08',
    closingTime: '9:05', closingDur: '不超過3分鐘',
    chairman: '蔡元勳',
    openPrayer: '林俊吉',
    closePrayer: '林睿穩',
    treasures: [
      { key: 't0', partNum: 1, title: '你信賴誰都沒關係嗎？', dur: '10分鐘', cat: 'treasures', time: '7:36', a0: '于樂洋' },
      { key: 't1', partNum: 2, title: '經文寶石', dur: '10分鐘', cat: 'gems', time: '7:46', a0: '卓誠幸' },
      { key: 't2', partNum: 3, title: '經文朗讀', dur: '4分鐘', cat: 'reading', roleLabel: '學生', time: '7:56', a0: '陳邵傑' },
    ],
    ministry: [
      { key: 'm0', partNum: 4, title: '初次交談 — 向住戶作見證', dur: '3分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:00', a0: '卓麗玲', a1: '高佳柔' },
      { key: 'm1', partNum: 5, title: '再次交談 — 向住戶作見證', dur: '4分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:04', a0: '蔡儀雯', a1: '張尋華' },
      { key: 'm2', partNum: 6, title: '教導人成為門徒 — 《美好生命》第19課', dur: '5分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:09', a0: '楊秀錦', a1: '陳怡霏' },
    ],
    living: [
      { key: 'l0', partNum: 7, title: '年輕人，聽耶和華的話肯定沒錯！', dur: '15分鐘', cat: 'living', time: '8:20', a0: '唐榮裕' },
      { key: 'cbs', partNum: 8, title: '會眾研經班', dur: '30分鐘', cat: 'cbs', roleLabel: '主持/朗讀', time: '8:35', a0: '張任超', a1: '潘宇喬' },
    ],
  },
  {
    date: '7月 23日',
    weekStart: '7月 20日',
    dateLabel: '7月20-26日',
    weekdayPill: '星期四 · 19:30',
    reading: '耶利米書18－19章',
    openSong: '44', openSongTime: '7:30',
    openIntroTime: '7:36',
    midSong: '38', midSongTime: '8:15',
    closeSong: '153', closeSongTime: '9:08',
    closingTime: '9:05', closingDur: '不超過3分鐘',
    chairman: '包恩德',
    openPrayer: '黃志強',
    closePrayer: '潘金智',
    treasures: [
      { key: 't0', partNum: 1, title: '犯了罪也不是無藥可救', dur: '10分鐘', cat: 'treasures', time: '7:36', a0: '鄭裕人' },
      { key: 't1', partNum: 2, title: '經文寶石', dur: '10分鐘', cat: 'gems', time: '7:46', a0: '廖永田' },
      { key: 't2', partNum: 3, title: '經文朗讀', dur: '4分鐘', cat: 'reading', roleLabel: '學生', time: '7:56', a0: '陳倫陞' },
    ],
    ministry: [
      { key: 'm0', partNum: 4, title: '初次交談 — 向住戶作見證', dur: '4分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:00', a0: '江瑞滿', a1: '敖芳琴' },
      { key: 'm1', partNum: 5, title: '再次交談 — 向住戶作見證', dur: '4分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:04', a0: '潘美惠', a1: '于靜茹' },
      { key: 'm2', partNum: 6, title: '解釋自己的信仰 — 《聖經問答》第44篇', dur: '4分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:09', a0: '羅紫軒' },
    ],
    living: [
      { key: 'l0', partNum: 7, title: '怎樣回到耶和華身邊', dur: '15分鐘', cat: 'living', time: '8:20', a0: '饒富田' },
      { key: 'cbs', partNum: 8, title: '會眾研經班', dur: '30分鐘', cat: 'cbs', roleLabel: '主持/朗讀', time: '8:35', a0: '卓誠幸', a1: '蘇大政' },
    ],
  },
  {
    date: '7月 30日',
    weekStart: '7月 27日',
    dateLabel: '7月27-8月2日',
    weekdayPill: '星期四 · 19:30',
    reading: '耶利米書20－21章',
    openSong: '73', openSongTime: '7:30',
    openIntroTime: '7:36',
    midSong: '57', midSongTime: '8:15',
    closeSong: '31', closeSongTime: '9:08',
    closingTime: '9:05', closingDur: '不超過3分鐘',
    chairman: '楊家松',
    openPrayer: '于樂洋',
    closePrayer: '潘宇喬',
    treasures: [
      { key: 't0', partNum: 1, title: '他勇敢地傳道', dur: '10分鐘', cat: 'treasures', time: '7:36', a0: '張嘉成' },
      { key: 't1', partNum: 2, title: '經文寶石', dur: '10分鐘', cat: 'gems', time: '7:46', a0: '唐榮裕' },
      { key: 't2', partNum: 3, title: '經文朗讀', dur: '4分鐘', cat: 'reading', roleLabel: '學生', time: '7:56', a0: '林俊吉' },
    ],
    ministry: [
      { key: 'm0', partNum: 4, title: '初次交談 — 在日常生活中作見證', dur: '4分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:00', a0: '鍾岳彤', a1: '劉美官' },
      { key: 'm1', partNum: 5, title: '再次交談 — 向住戶作見證', dur: '4分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:04', a0: '張筱君', a1: '唐翠金' },
      { key: 'm2', partNum: 6, title: '解釋自己的信仰 — 《設計者》第41篇', dur: '4分鐘', cat: 'ministry', roleLabel: '學生/助手', time: '8:09', a0: '蘇子瑩', a1: '蘇美玲' },
    ],
    living: [
      { key: 'l0', partNum: 8, title: '因為關心，所以改變', dur: '15分鐘', cat: 'living', time: '8:20', a0: '林睿穩' },
      { key: 'cbs', partNum: 9, title: '會眾研經班', dur: '30分鐘', cat: 'cbs', roleLabel: '主持/朗讀', time: '8:35', a0: '蔡元勳', a1: '廖子君' },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function normDate(s) {
  return String(s ?? '').replace(/\s+/g, '');
}

function sectionParts(entries, section) {
  return entries.map(({ key, partNum, title, dur, cat, roleLabel, time }) => ({
    partKey: key,
    section,
    partNum,
    title,
    dur,
    cat,
    roleLabel: roleLabel ?? null,
    time: time ?? null,
    cbsRef: null,
  }));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const congregation = await prisma.congregation.findFirst();
  if (!congregation) {
    console.error('找不到會眾。');
    process.exit(1);
  }
  console.log(`會眾：${congregation.name} (id=${congregation.id})\n`);

  let weeksSaved = 0, partsSaved = 0, assignsSaved = 0;

  for (const entry of WEEKS) {
    console.log(`\n── 處理 ${entry.date} ──`);

    // ── Upsert week ────────────────────────────────────────────────────────
    const weekData = {
      date: entry.date,
      weekStart: entry.weekStart,
      dateLabel: entry.dateLabel,
      weekdayPill: entry.weekdayPill,
      reading: entry.reading,
      openSong: entry.openSong,
      openSongTime: entry.openSongTime,
      openIntroTime: entry.openIntroTime,
      midSong: entry.midSong,
      midSongTime: entry.midSongTime,
      closeSong: entry.closeSong,
      closeSongTime: entry.closeSongTime,
      closingTime: entry.closingTime,
      closingDur: entry.closingDur,
    };

    const existing = await prisma.midweekWeek.findFirst({
      where: {
        congregationId: congregation.id,
        OR: [
          { weekStart: entry.weekStart },
          { date: entry.date },
        ],
      },
    });

    const week = existing
      ? await prisma.midweekWeek.update({ where: { id: existing.id }, data: weekData })
      : await prisma.midweekWeek.create({ data: { ...weekData, congregationId: congregation.id } });

    console.log(`  週次 id=${week.id} (${existing ? '更新' : '新建'})`);
    weeksSaved++;

    // ── Upsert parts ───────────────────────────────────────────────────────
    const allParts = [
      ...sectionParts(entry.treasures, 'treasures'),
      ...sectionParts(entry.ministry, 'ministry'),
      ...sectionParts(entry.living, 'living'),
    ];

    const incomingKeys = allParts.map(p => p.partKey);
    await prisma.part.deleteMany({
      where: { weekId: week.id, partKey: { notIn: incomingKeys } },
    });

    for (const part of allParts) {
      await prisma.part.upsert({
        where: { weekId_partKey: { weekId: week.id, partKey: part.partKey } },
        update: part,
        create: { ...part, weekId: week.id },
      });
      console.log(`  ✓ part ${part.partKey} — ${part.title}`);
      partsSaved++;
    }

    // ── Upsert assignments ─────────────────────────────────────────────────
    const slots = [
      { slotId: `mw${week.id}_chairman`, name: entry.chairman },
      { slotId: `mw${week.id}_openPrayer`, name: entry.openPrayer },
      { slotId: `mw${week.id}_closePrayer`, name: entry.closePrayer },
    ];

    for (const section of [entry.treasures, entry.ministry, entry.living]) {
      for (const part of section) {
        if (part.a0) slots.push({ slotId: `mw${week.id}_${part.key}_0`, name: part.a0 });
        if (part.a1) slots.push({ slotId: `mw${week.id}_${part.key}_1`, name: part.a1 });
      }
    }

    for (const { slotId, name } of slots) {
      if (!name) continue;
      await prisma.assignment.upsert({
        where: { slotId },
        update: { name },
        create: { slotId, weekId: week.id, name },
      });
      console.log(`  ✓ ${slotId} = ${name}`);
      assignsSaved++;
    }
  }

  console.log(`\n完成。週次 ${weeksSaved} 個，節目項目 ${partsSaved} 個，指派 ${assignsSaved} 條。`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
