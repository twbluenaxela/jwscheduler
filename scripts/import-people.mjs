/**
 * One-time script to import congregation members from historical schedule data.
 * Run with: node --env-file=.env scripts/import-people.mjs
 *
 * Uses upsert (by congregationId + name) — safe to run multiple times.
 * Review gender (g) and appointment (appt) after import and adjust in the app.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PEOPLE = [
  // ── 主席 / 演講弟兄 ───────────────────────────────────────────────────────
  { name: '廖永田', g: 'M', appt: '長老',    quals: ['主席', '寶藏演講', '研經班主持'] },
  { name: '卓誠幸', g: 'M', appt: '長老',    quals: ['主席', '寶藏演講', '研經班主持'] },
  { name: '蔡元勳', g: 'M', appt: '長老',    quals: ['主席', '生活演講'] },
  { name: '包恩德', g: 'M', appt: '長老',    quals: ['主席', '寶藏演講', '生活演講', '研經班主持'] },
  { name: '唐榮裕', g: 'M', appt: '長老',    quals: ['主席', '寶藏演講', '研經班朗讀', '研經班主持'] },
  { name: '王以梵', g: 'M', appt: '長老',    quals: ['主席', '寶藏演講', '生活演講'] },
  { name: '張任超', g: 'M', appt: '長老',    quals: ['主席', '研經班主持'] },
  { name: '鄭裕人', g: 'M', appt: '長老',    quals: ['主席', '研經班主持'] },
  { name: '柯智維', g: 'M', appt: '長老',    quals: ['主席', '研經班主持'] },
  { name: '楊家松', g: 'M', appt: '助理僕人', quals: ['寶藏演講', '生活演講', '研經班主持'] },
  { name: '于樂洋', g: 'M', appt: '助理僕人', quals: ['寶藏演講', '經文朗讀', '生活演講'] },
  { name: '張嘉成', g: 'M', appt: '助理僕人', quals: ['寶藏演講', '生活演講', '經文朗讀'] },
  { name: '周家寶', g: 'M', appt: '助理僕人', quals: ['寶藏演講', '生活演講'] },
  { name: '林睿穩', g: 'M', appt: '助理僕人', quals: ['生活演講'] },
  { name: '饒富田', g: 'M', appt: '助理僕人', quals: ['禱告', '寶藏演講', '經文朗讀'] },
  { name: '林俊吉', g: 'M', appt: '助理僕人', quals: ['禱告', '寶藏演講'] },
  { name: '羅紫軒', g: 'M', appt: '助理僕人', quals: ['禱告', '經文朗讀', '研經班朗讀'] },
  { name: '潘金智', g: 'M', appt: '助理僕人', quals: ['禱告', '經文朗讀', '研經班朗讀'] },
  { name: '黃志強', g: 'M', appt: '助理僕人', quals: ['禱告', '研經班朗讀'] },
  { name: '蘇大政', g: 'M', appt: '助理僕人', quals: ['禱告', '研經班朗讀'] },
  { name: '廖子君', g: 'M', appt: '助理僕人', quals: ['禱告', '研經班朗讀'] },
  { name: '潘宇喬', g: 'M', appt: '助理僕人', quals: ['禱告', '研經班朗讀', '傳道示範'] },
  { name: '陳秉宏', g: 'M', appt: '傳道員',   quals: ['禱告'] },
  { name: '丁占峯', g: 'M', appt: '傳道員',   quals: ['經文朗讀'] },
  { name: '潘知樂', g: 'M', appt: '傳道員',   quals: ['經文朗讀'] },
  { name: '饒詠',   g: 'M', appt: '傳道員',   quals: ['經文朗讀'] },
  // ── 傳道示範 弟兄 ─────────────────────────────────────────────────────────
  { name: '鄧渝文', g: 'M', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '陳予祥', g: 'M', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '張尋華', g: 'M', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '饒士耘', g: 'M', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '鍾岳彤', g: 'M', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '陳宜玄', g: 'M', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '羅辰恩', g: 'M', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '饒滿',   g: 'M', appt: '傳道員',   quals: ['傳道示範'] },
  // ── 傳道示範 姊妹 ─────────────────────────────────────────────────────────
  { name: '鄭雅子', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '蔡儀雯', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '包愛倫', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '許敏儀', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '陳琳',   g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '張筱君', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '楊曉琴', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '羅思雅', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '王直子', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '蘇美玲', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '陳芝吟', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '羅靜妮', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '張玉燕', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '黃郁芳', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '于靜茹', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '許喬雅', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '陳振芬', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '張子婷', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '陳香如', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '蔡麗芬', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '高佳柔', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '許文英', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '楊翠菊', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '賴麗詩', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '廖子聆', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '陳怡霏', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '敖芳琴', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '唐翠金', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '張毓琳', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '陳怡惠', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
  { name: '劉美官', g: 'F', appt: '傳道員',   quals: ['傳道示範'] },
];

async function main() {
  // Find the congregation
  const congregation = await prisma.congregation.findFirst();
  if (!congregation) {
    console.error('找不到會眾。請先建立會眾。');
    process.exit(1);
  }
  console.log(`會眾：${congregation.name} (id=${congregation.id})`);

  let created = 0, updated = 0, skipped = 0;

  // Deduplicate PEOPLE list by name
  const seen = new Set();
  const uniquePeople = PEOPLE.filter(p => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  for (const p of uniquePeople) {
    try {
      const existing = await prisma.person.findFirst({
        where: { congregationId: congregation.id, name: p.name },
      });
      if (existing) {
        await prisma.person.update({
          where: { id: existing.id },
          data: { gender: p.g, appointment: p.appt, tags: p.quals },
        });
        updated++;
        console.log(`  更新：${p.name}`);
      } else {
        await prisma.person.create({
          data: {
            congregationId: congregation.id,
            name: p.name,
            gender: p.g,
            appointment: p.appt,
            tags: p.quals,
            status: 'active',
          },
        });
        created++;
        console.log(`  新增：${p.name}`);
      }
    } catch (err) {
      skipped++;
      console.warn(`  跳過 ${p.name}：${err.message}`);
    }
  }

  console.log(`\n完成。新增 ${created} 人，更新 ${updated} 人，跳過 ${skipped} 人。`);
  console.log('請在「人員」頁面檢查並調整性別與職務。');
}

main().catch(console.error).finally(() => prisma.$disconnect());
