/**
 * One-time cleanup: generic series cards (w / mwb / wlp) inherit a dated issue's
 * cover, which makes them look like duplicate cards in the request form. Clear
 * those covers so they render as plain title placeholders. Dated issue covers
 * and the 英/日/大字 fallback logic are untouched.
 *
 * Dry run by default; pass --apply to write.
 *   node --env-file=.env scripts/clear-generic-covers.mjs --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');

async function main() {
  const congregation = await prisma.congregation.findUnique({ where: { code: 'xinwu' } });
  if (!congregation) throw new Error('找不到會眾 xinwu');
  const rows = await prisma.publication.findMany({
    where: { congregationId: congregation.id, code: { in: ['w', 'mwb', 'wlp'] }, coverToken: { not: null } },
    select: { id: true, code: true, name: true, language: true, format: true },
  });
  console.log(`會眾：${congregation.name} — ${apply ? '套用' : 'DRY RUN'}`);
  for (const row of rows) console.log(`  #${row.id} ${row.code}/${row.language}/${row.format} ${row.name}`);
  console.log(`共 ${rows.length} 筆通用卡封面將移除`);
  if (!apply || !rows.length) return;
  await prisma.$transaction(async (tx) => {
    const ids = rows.map((r) => r.id);
    await tx.publicationCover.deleteMany({ where: { publicationId: { in: ids } } });
    await tx.publication.updateMany({ where: { id: { in: ids } }, data: { coverToken: null } });
  });
  console.log('完成');
}
main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
