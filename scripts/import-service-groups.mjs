/** Dry run by default. Use --apply to save; add --create-missing to create unmatched roster members. */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

const NAME_ALIASES = {
  于靜茹: '彭靜茹',
  廖瑞滿: '江瑞滿',
  趙姍娜: '趙珊娜',
};

// Applies only to roster people not yet in Person; confirmed by the user on 2026-11-15.
const MISSING_GENDER_DEFAULT = 'F';
const MISSING_BROTHERS = new Set(['林眾望', '周世郁', '周宜伸']);

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const index = args.indexOf('--congregation');
const code = index < 0 ? 'xinwu' : args[index + 1];
const apply = args.includes('--apply');
const createMissing = args.includes('--create-missing');
const matchName = (name) => NAME_ALIASES[name] ?? name;

async function main() {
  if (!code || (index >= 0 && code.startsWith('--'))) throw new Error('請指定會眾代碼');
  const congregation = await prisma.congregation.findUnique({ where: { code } });
  if (!congregation) {
    const available = await prisma.congregation.findMany({
      select: { code: true },
      orderBy: { code: 'asc' },
    });
    throw new Error(
      `找不到會眾 ${code}。可用代碼：${available.map((c) => c.code).join(', ') || '無'}`,
    );
  }
  const roster = JSON.parse(
    readFileSync(new URL('./data/service-groups-2026-11.json', import.meta.url)),
  );
  const people = await prisma.person.findMany({
    where: { congregationId: congregation.id },
    orderBy: { name: 'asc' },
  });
  const byName = new Map(people.map((p) => [p.name, p]));
  const names = new Set(roster.map((p) => matchName(p.name)));
  console.log(`會眾：${congregation.name} (${code}) — ${apply ? '套用' : 'DRY RUN'}`);
  console.log('\n(1) 已配對：');
  for (const entry of roster) {
    const person = byName.get(matchName(entry.name));
    if (!person) continue;
    const displayName = person.name === entry.name ? entry.name : `${entry.name} → ${person.name}`;
    console.log(
      `  ${displayName}：${person.serviceGroup ?? '無'}/${person.groupRole ?? '無'} → ${entry.group}/${entry.groupRole ?? '無'}`,
    );
    if (apply)
      await prisma.person.update({
        where: { id: person.id },
        data: { serviceGroup: entry.group, groupRole: entry.groupRole },
      });
  }
  console.log('\n(2) 名單中找不到的人員：');
  for (const entry of roster.filter((p) => !byName.has(matchName(p.name)))) {
    const gender = MISSING_BROTHERS.has(entry.name) ? 'M' : MISSING_GENDER_DEFAULT;
    if (!createMissing) {
      console.log(`  ${entry.name} (${entry.group})`);
      continue;
    }
    console.log(
      `  ${apply ? '新增' : '將新增'} ${entry.name} (${gender}, ${entry.group}/${entry.groupRole ?? '無'})`,
    );
    if (apply) {
      await prisma.person.create({
        data: {
          congregationId: congregation.id,
          name: entry.name,
          gender,
          appointment: '',
          tags: [],
          status: 'active',
          serviceGroup: entry.group,
          groupRole: entry.groupRole,
        },
      });
    }
  }
  console.log('\n(3) 未列於名單的在籍人員：');
  for (const person of people.filter((p) => p.status === 'active' && !names.has(p.name)))
    console.log(`  ${person.name}`);
}
main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
