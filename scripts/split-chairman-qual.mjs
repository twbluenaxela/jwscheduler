/**
 * Splits the old single「主席」qualification into three distinct quals:
 *   傳道與生活主席 (midweek chairman)
 *   週末聚會主席   (weekend meeting chairman)
 *   守望台主持人   (Watchtower study conductor)
 *
 * Every Person whose `tags` contains「主席」gets all three new tags and has
 * the legacy「主席」tag removed. Idempotent — safe to run more than once.
 *
 * Run with: node --env-file=.env scripts/split-chairman-qual.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const OLD_TAG = '主席';
const NEW_TAGS = ['傳道與生活主席', '週末聚會主席', '守望台主持人'];

async function main() {
  const people = await prisma.person.findMany({
    where: { tags: { has: OLD_TAG } },
    select: { id: true, name: true, congregationId: true, tags: true },
  });

  if (people.length === 0) {
    console.log(`沒有任何人員帶有「${OLD_TAG}」標籤，無需遷移。`);
    return;
  }

  console.log(`找到 ${people.length} 位帶有「${OLD_TAG}」標籤的人員，開始遷移…\n`);

  for (const p of people) {
    // drop the legacy tag, add the three new ones (dedup)
    const next = new Set(p.tags.filter(t => t !== OLD_TAG));
    NEW_TAGS.forEach(t => next.add(t));
    const tags = [...next];

    await prisma.person.update({ where: { id: p.id }, data: { tags } });
    console.log(`  ✓ ${p.name} → [${tags.join('、')}]`);
  }

  console.log(`\n完成，共更新 ${people.length} 位人員。`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
