/**
 * One-time script to import historical assignment data (May–June 2026).
 * Run with: node --env-file=.env scripts/import-assignments.mjs
 *
 * 于靜茹 is mapped to 彭靜茹 (real name). Run merge-person.mjs first to
 * clean up the duplicate Person record.
 *
 * Safe to re-run — uses upsert on each slotId.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ── Schedule data ─────────────────────────────────────────────────────────────
// Keys follow the epubParser slot-id convention:
//   special: chairman / openPrayer / closePrayer
//   part _0: main speaker / student
//   part _1: helper / second person
// 于靜茹 → 彭靜茹 (real surname)

const SCHEDULE = [
  {
    date: '5月6日',
    chairman: '廖永田', openPrayer: '羅紫軒', closePrayer: '饒富田',
    parts: {
      t0: { _0: '卓誠幸' },
      t1: { _0: '林俊吉' },
      t2: { _0: '丁占峯' },
      m0: { _0: '鄧渝文', _1: '鄭雅子' },
      m1: { _0: '陳予祥', _1: '蔡儀雯' },
      m2: { _0: '潘宇喬' },
      l0: { _0: '包恩德' },
      cbs: { _0: '張任超', _1: '黃志強' },
    },
  },
  {
    date: '5月13日',
    chairman: '蔡元勳', openPrayer: '潘金智', closePrayer: '羅紫軒',
    parts: {
      t0: { _0: '饒富田' },
      t1: { _0: '于樂洋' },
      t2: { _0: '張嘉成' },
      m0: { _0: '賴麗詩', _1: '鄧渝文' },
      m1: { _0: '包愛倫', _1: '許敏儀' },
      m2: { _0: '陳琳',   _1: '張筱君' },
      l0: { _0: '蔡元勳' },
      cbs: { _0: '唐榮裕', _1: '廖子君' },
    },
  },
  {
    date: '5月20日',
    chairman: '包恩德', openPrayer: '林俊吉', closePrayer: '黃志強',
    parts: {
      t0: { _0: '王以梵' },
      t1: { _0: '唐榮裕' },
      t2: { _0: '于樂洋' },
      m0: { _0: '陳芝吟', _1: '羅靜妮' },
      m1: { _0: '張玉燕', _1: '黃郁芳' },
      m2: { _0: '彭靜茹', _1: '許喬雅' },  // 于靜茹 → 彭靜茹
      l0: { _0: '蔡元勳' },
      cbs: { _0: '廖永田', _1: '潘宇喬' },
    },
  },
  {
    date: '5月27日',
    chairman: '唐榮裕', openPrayer: '蘇大政', closePrayer: '潘金智',
    parts: {
      t0: { _0: '張嘉成' },
      t1: { _0: '包恩德' },
      t2: { _0: '潘知樂' },
      m0: { _0: '饒士耘', _1: '鍾岳彤' },
      m1: { _0: '楊曉琴', _1: '陳宜玄' },
      m2: { _0: '羅思雅', _1: '王直子' },
      m3: { _0: '蘇美玲', _1: '羅辰恩' },
      l0: { _0: '于樂洋' },
      cbs: { _0: '楊家松', _1: '羅紫軒' },
    },
  },
  {
    date: '6月3日',
    chairman: '王以梵', openPrayer: '林俊吉', closePrayer: '廖子君',
    parts: {
      t0: { _0: '于樂洋' },
      t1: { _0: '楊家松' },
      t2: { _0: '饒富田' },
      m0: { _0: '陳振芬', _1: '張子婷' },
      m1: { _0: '陳香如', _1: '蔡麗芬' },
      m2: { _0: '高佳柔', _1: '許文英' },
      l0: { _0: '周家寶' },
      l1: { _0: '張嘉成' },
      cbs: { _0: '卓誠幸', _1: '潘金智' },
    },
  },
  {
    date: '6月10日',
    chairman: '鄭裕人', openPrayer: '黃志強', closePrayer: '潘宇喬',
    parts: {
      t0: { _0: '廖永田' },
      t1: { _0: '周家寶' },
      t2: { _0: '潘金智' },
      m0: { _0: '楊翠菊', _1: '羅思雅' },
      m1: { _0: '饒滿',   _1: '賴麗詩' },
      m2: { _0: '張尋華', _1: '陳予祥' },
      m3: { _0: '陳宜玄', _1: '包愛倫' },
      l0: { _0: '林睿穩' },
      l1: { _0: '王以梵' },
      cbs: { _0: '包恩德', _1: '蘇大政' },
    },
  },
  {
    date: '6月16日',
    chairman: '卓誠幸', openPrayer: '廖子君', closePrayer: '張嘉成',
    parts: {
      t0: { _0: '饒富田' },
      t1: { _0: '于樂洋' },
      t2: { _0: '羅紫軒' },
      m0: { _0: '劉美官', _1: '饒士耘' },
      m1: { _0: '廖子聆', _1: '楊曉琴' },
      m2: { _0: '陳怡霏', _1: '彭靜茹' },  // 于靜茹 → 彭靜茹
      l0: { _0: '楊家松' },
      l1: { _0: '卓誠幸' },
      cbs: { _0: '柯智維' },  // no reader during 分區監督探訪
    },
  },
  {
    date: '6月24日',
    chairman: '張任超', openPrayer: '陳秉宏', closePrayer: '于樂洋',
    parts: {
      t0: { _0: '林睿穩' },
      t1: { _0: '林俊吉' },
      t2: { _0: '饒詠' },
      m0: { _0: '敖芳琴', _1: '張玉燕' },
      m1: { _0: '唐翠金', _1: '張毓琳' },
      m2: { _0: '許喬雅', _1: '陳怡惠' },
      l0: { _0: '包恩德' },
      cbs: { _0: '廖永田', _1: '黃志強' },
    },
  },
];

// ── Normalise Chinese date for comparison ─────────────────────────────────────
function normDate(s) {
  return String(s ?? '').replace(/\s+/g, '');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const congregation = await prisma.congregation.findFirst();
  if (!congregation) {
    console.error('找不到會眾。');
    process.exit(1);
  }
  console.log(`會眾：${congregation.name} (id=${congregation.id})\n`);

  const weeks = await prisma.midweekWeek.findMany({
    where: { congregationId: congregation.id },
    orderBy: { id: 'asc' },
    include: { parts: { orderBy: [{ section: 'asc' }, { partNum: 'asc' }] } },
  });

  if (!weeks.length) {
    console.error('找不到聚會週次。請先從 EPUB 匯入節目。');
    process.exit(1);
  }

  console.log(`DB 中有 ${weeks.length} 個週次：`);
  weeks.forEach(w => console.log(`  id=${w.id}  date="${w.date}"  parts=${w.parts.length}`));
  console.log();

  let upserted = 0, skipped = 0;

  for (const entry of SCHEDULE) {
    const week = weeks.find(w => normDate(w.date) === normDate(entry.date));
    if (!week) {
      console.warn(`  ⚠ 找不到日期 ${entry.date} 的週次，跳過`);
      skipped++;
      continue;
    }

    console.log(`週次 ${entry.date} (id=${week.id}):`);

    // Build a map of partKey → part for this week
    const partMap = new Map(week.parts.map(p => [p.partKey, p]));

    // Special slots
    const specials = [
      { slotId: `mw${week.id}_chairman`, name: entry.chairman },
      { slotId: `mw${week.id}_openPrayer`, name: entry.openPrayer },
      { slotId: `mw${week.id}_closePrayer`, name: entry.closePrayer },
    ];
    for (const { slotId, name } of specials) {
      if (!name) continue;
      await prisma.assignment.upsert({
        where: { slotId },
        update: { name },
        create: { slotId, weekId: week.id, name },
      });
      console.log(`  ✓ ${slotId} = ${name}`);
      upserted++;
    }

    // Part slots
    for (const [partKey, assigns] of Object.entries(entry.parts)) {
      const part = partMap.get(partKey);
      if (!part) {
        console.warn(`  ⚠ 找不到 partKey="${partKey}"，跳過`);
        skipped++;
        continue;
      }
      for (const [suffix, name] of Object.entries(assigns)) {
        if (!name) continue;
        const slotId = `mw${week.id}_${partKey}${suffix}`;
        await prisma.assignment.upsert({
          where: { slotId },
          update: { name },
          create: { slotId, weekId: week.id, name },
        });
        console.log(`  ✓ ${slotId} = ${name}`);
        upserted++;
      }
    }
  }

  console.log(`\n完成。寫入 ${upserted} 條指派，跳過 ${skipped} 個。`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
