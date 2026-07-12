/**
 * One-time (idempotent): seed the new 傳道討論主持 qualification — who may
 * conduct ministry-section discussion parts (節目包括討論, e.g. 你會怎麼說？;
 * S-38 ¶6: an elder or qualified ministerial servant).
 *
 * Backfills every ACTIVE BROTHER who already has 生活演講 (the existing
 * living-section conductor pool — same profile); prune/add in 人員 afterwards.
 *
 * Run with: node --env-file=.env scripts/add-ministry-disc-qual.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const NEW_QUAL = '傳道討論主持';

async function main() {
  const people = await prisma.person.findMany({
    where: { gender: 'M', status: 'active', tags: { has: '生活演講' } },
  });

  let tagged = 0;
  for (const p of people) {
    if (p.tags.includes(NEW_QUAL)) continue;
    await prisma.person.update({
      where: { id: p.id },
      data: { tags: [...p.tags, NEW_QUAL] },
    });
    console.log(`✓ ${p.name}（${p.appointment || '—'}）加上「${NEW_QUAL}」`);
    tagged++;
  }

  console.log(`\n完成。加資格 ${tagged} 人（共 ${people.length} 位符合的弟兄）。`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
