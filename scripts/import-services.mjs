import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_CATEGORIES } from '../app/lib/services.mjs';
import { parseIsoDate, toIsoDate } from '../app/lib/cnDate.mjs';

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith('--'));
if (!file || args.some((arg) => arg.startsWith('--') && arg !== '--apply'))
  throw new Error('Usage: node --env-file=.env scripts/import-services.mjs FILE [--apply]');
const apply = args.includes('--apply');
const input = JSON.parse(await readFile(file, 'utf8'));
const db = new PrismaClient();
try {
  const congregation = await db.congregation.findUnique({ where: { code: 'xinwu' } });
  if (!congregation) throw new Error('找不到 xinwu 會眾');
  const [people] = await Promise.all([db.person.findMany({ where: { congregationId: congregation.id } })]);
  const peopleByName = new Map(people.map((person) => [person.name, person]));
  const matched = new Set(),
    unmatched = new Set();
  const rows = [];
  for (const [key, category] of Object.entries(input.categories || {})) {
    if (key === 'cleaning') {
      for (const entry of category.months || [])
        rows.push({
          key,
          date: `${entry.month}-01`,
          position: '小組',
          text: entry.groups.join(','),
          personId: null,
        });
      continue;
    }
    const definition = DEFAULT_CATEGORIES.find((item) => item.key === key && item.kind === 'slots');
    if (!definition) throw new Error(`未知類別: ${key}`);
    for (const row of category.rows || [])
      for (const position of category.positions) {
        const value = row[position];
        if (!value) continue;
        const person = typeof value === 'string' ? peopleByName.get(value) : null;
        if (typeof value === 'string') (person ? matched : unmatched).add(value);
        rows.push({
          key,
          date: row.date,
          position,
          personId: person?.id ?? null,
          text: person ? null : typeof value === 'string' ? value : value.text,
        });
      }
  }
  for (const row of rows)
    if (toIsoDate(parseIsoDate(row.date)) !== row.date) throw new Error(`日期無效: ${row.date}`);
  console.log(`模式: ${apply ? '寫入' : '預覽'}; ${rows.length} 筆`);
  console.log('已匹配:', [...matched].sort().join('、'));
  console.log('未匹配:', [...unmatched].sort().join('、'));
  if (apply)
    await db.$transaction(
      async (tx) => {
        await tx.serviceCategory.createMany({
          data: DEFAULT_CATEGORIES.map((category) => ({ ...category, congregationId: congregation.id })),
          skipDuplicates: true,
        });
        const categories = await tx.serviceCategory.findMany({ where: { congregationId: congregation.id } });
        const byKey = new Map(categories.map((category) => [category.key, category]));
        for (const [key, category] of Object.entries(input.categories || {}))
          if (category.notes !== undefined && byKey.has(key))
            await tx.serviceCategory.update({
              where: { id: byKey.get(key).id },
              data: { notes: category.notes },
            });
        for (let offset = 0; offset < rows.length; offset += 100) {
          await Promise.all(
            rows.slice(offset, offset + 100).map((row) => {
              const categoryId = byKey.get(row.key).id;
              return tx.serviceAssignment.upsert({
                where: { categoryId_date_position: { categoryId, date: row.date, position: row.position } },
                create: {
                  congregationId: congregation.id,
                  categoryId,
                  date: row.date,
                  position: row.position,
                  personId: row.personId,
                  text: row.text,
                },
                update: { personId: row.personId, text: row.text },
              });
            }),
          );
        }
      },
      { timeout: 60000, maxWait: 10000 },
    );
} finally {
  await db.$disconnect();
}
