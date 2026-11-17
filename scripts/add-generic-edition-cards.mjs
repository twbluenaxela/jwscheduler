/**
 * One-time catalog fix: add the generic language cards used as the 中/英/日
 * fallback on 守望台研讀版 / 聚會手冊 cards (including 大字版).
 * Dry run by default; pass --apply to write.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const rows = [
  { code: 'mwb', language: 'JPN', format: 'standard', name: '聚會手冊（日文）' },
  { code: 'wlp', language: 'ENG', format: 'large', name: 'The Watchtower (Study Edition, Large Print)' },
  { code: 'wlp', language: 'JPN', format: 'large', name: 'ものみの塔（研究用・大字版）' },
];

async function main() {
  const congregation = await prisma.congregation.findUnique({ where: { code: 'xinwu' } });
  if (!congregation) throw new Error('找不到會眾 xinwu');
  console.log(`會眾：${congregation.name} — ${apply ? '套用' : 'DRY RUN'}`);
  for (const row of rows) {
    const where = {
      congregationId_code_language_format: {
        congregationId: congregation.id, code: row.code, language: row.language, format: row.format,
      },
    };
    const existing = await prisma.publication.findUnique({ where });
    console.log(`  ${row.code}/${row.language}/${row.format} — ${existing ? `已存在 #${existing.id} ${existing.name}` : `新增 ${row.name}`}`);
    if (!existing && apply) {
      await prisma.publication.create({
        data: {
          congregationId: congregation.id, ...row, category: 'study', issue: null,
          aliases: [], itemNumber: null, note: null, active: true, requestable: true,
        },
      });
    }
  }
}
main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
