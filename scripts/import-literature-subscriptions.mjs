/** Dry run by default. Use --apply to save subscriptions and missing catalog items. */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const index = args.indexOf('--congregation');
const code = index < 0 ? 'xinwu' : args[index + 1];
const apply = args.includes('--apply');
const catalog = [
  { code: 'wcg', format: 'large', language: 'CHT', name: '鼓起勇氣與上帝同行（大字版）', category: 'book' },
  { code: 'wcg', format: 'standard', language: 'ENG', name: 'Walk With God Courageously (Courage)', category: 'book' },
  { code: 'wcg', format: 'standard', language: 'JPN', name: '鼓起勇氣與上帝同行（日文）', category: 'book' },
  { code: 'wcg-sln', format: 'standard', language: 'CHT', name: '手語筆記本', category: 'other' },
];

async function main() {
  if (!code || code.startsWith('--')) throw new Error('請指定會眾代碼');
  const congregation = await prisma.congregation.findUnique({ where: { code } });
  if (!congregation) throw new Error(`找不到會眾 ${code}`);
  const entries = JSON.parse(readFileSync(new URL('./data/literature-subscriptions-2026-11.json', import.meta.url)));
  const people = await prisma.person.findMany({ where: { congregationId: congregation.id } });
  const byName = new Map(people.map((person) => [person.name, person]));
  console.log(`會眾：${congregation.name} (${code}) — ${apply ? '套用' : 'DRY RUN'}`);
  console.log('\n已配對：');
  for (const entry of entries) {
    const person = byName.get(entry.name);
    if (!person) continue;
    console.log(`  ${entry.name}：${entry.series} ${entry.language} ×${entry.quantity}`);
    if (apply) {
      await prisma.literatureSubscription.upsert({
        where: { personId_series_language: { personId: person.id, series: entry.series, language: entry.language } },
        create: { congregationId: congregation.id, personId: person.id, series: entry.series, language: entry.language, quantity: entry.quantity, active: true },
        update: { quantity: entry.quantity, active: true },
      });
    }
  }
  console.log('\n未配對：');
  for (const entry of entries.filter((item) => !byName.has(item.name))) {
    console.log(`  ${entry.name}：${entry.series} ${entry.language} ×${entry.quantity}`);
  }
  console.log('\n確認目錄品項：');
  for (const item of catalog) {
    console.log(`  ${item.code} ${item.language} ${item.format}：${item.name}`);
    if (apply) {
      await prisma.publication.upsert({
        where: { congregationId_code_language_format: { congregationId: congregation.id, code: item.code, language: item.language, format: item.format } },
        create: { ...item, congregationId: congregation.id, aliases: [], note: '代號待確認' },
        update: {},
      });
    }
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
