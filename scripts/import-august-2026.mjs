/**
 * Import August 2026 midweek schedule assignments (names only — weeks/parts
 * already exist in the DB from EPUB import).
 * Run with: node --env-file=.env scripts/import-august-2026.mjs
 *
 * Safe to re-run — upserts Assignment rows by slotId.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const WEEKS = [
  {
    date: '8月 6日',
    chairman: '王以梵',
    openPrayer: '林俊吉',
    closePrayer: '蘇大政',
    parts: {
      t0: { a0: '卓誠幸' },
      t1: { a0: '林睿穩' },
      t2: { a0: '陳秉宏' },
      m0: { a0: '何惠英', a1: '鄧渝文' },
      m1: { a0: '黃郁芳', a1: '廖子聆' },
      m2: { a0: '于樂洋' },
      l0: { a0: '周業邦' },
      cbs: { a0: '楊家松', a1: '潘金智' },
    },
  },
  {
    date: '8月 13日',
    chairman: '唐榮裕',
    openPrayer: '黃志強',
    closePrayer: '廖子君',
    parts: {
      t0: { a0: '饒富田' },
      t1: { a0: '張嘉成' },
      t2: { a0: '潘宇喬' },
      m0: { a0: '曾慧慧', a1: '蔡儀雯' },
      m1: { a0: '邱敏玉', a1: '潘美惠' },
      m2: { a0: '王直子', a1: '黃圓美' },
      l0: { a0: '王以梵' },
      cbs: { a0: '鄭裕人', a1: '羅紫軒' },
    },
  },
  {
    date: '8月 20日',
    chairman: '鄭裕人',
    openPrayer: '潘金智',
    closePrayer: '張嘉成',
    parts: {
      t0: { a0: '蔡元勳' },
      t1: { a0: '林俊吉' },
      t2: { a0: '曾友信' },
      m0: { a0: '張毓琳', a1: '蘇子瑩' },
      m1: { a0: '羅靜妮', a1: '饒滿' },
      m2: { a0: '張子婷', a1: '黃郁芳' },
      l0: { a0: '張任超' },
      cbs: { a0: '包恩德', a1: '陳秉宏' },
    },
  },
  {
    date: '8月 27日',
    chairman: '卓誠幸',
    openPrayer: '陳秉宏',
    closePrayer: '潘宇喬',
    parts: {
      t0: { a0: '林睿穩' },
      t1: { a0: '羅紫軒' },
      t2: { a0: '蘇大政' },
      m0: { a0: '蔡麗芬', a1: '許喬雅' },
      m1: { a0: '許敏儀', a1: '鍾岳彤' },
      m2: { a0: '饒富田' },
      l0: { a0: '于樂洋' },
      l1: { a0: '張任超' },
      cbs: { a0: '廖永田', a1: '黃志強' },
    },
  },
];

async function main() {
  const congregation = await prisma.congregation.findFirst();
  if (!congregation) {
    console.error('找不到會眾。');
    process.exit(1);
  }
  console.log(`會眾：${congregation.name} (id=${congregation.id})\n`);

  let assignsSaved = 0;

  for (const entry of WEEKS) {
    const week = await prisma.midweekWeek.findFirst({
      where: { congregationId: congregation.id, date: entry.date },
      include: { parts: true },
    });

    if (!week) {
      console.error(`  ✗ 找不到週次 ${entry.date}，略過`);
      continue;
    }

    console.log(`\n── ${entry.date} (week id=${week.id}) ──`);

    const partKeys = new Set(week.parts.map(p => p.partKey));
    const slots = [
      { slotId: `mw${week.id}_chairman`, name: entry.chairman },
      { slotId: `mw${week.id}_openPrayer`, name: entry.openPrayer },
      { slotId: `mw${week.id}_closePrayer`, name: entry.closePrayer },
    ];

    for (const [partKey, { a0, a1 }] of Object.entries(entry.parts)) {
      if (!partKeys.has(partKey)) {
        console.error(`  ✗ 週次 ${entry.date} 沒有 partKey=${partKey}，略過`);
        continue;
      }
      if (a0) slots.push({ slotId: `mw${week.id}_${partKey}_0`, name: a0 });
      if (a1) slots.push({ slotId: `mw${week.id}_${partKey}_1`, name: a1 });
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

  console.log(`\n完成。指派 ${assignsSaved} 條。`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
