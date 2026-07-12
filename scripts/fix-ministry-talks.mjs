/**
 * One-time (idempotent) repair for ministry-section 演講 parts:
 *
 * 1. Parts whose title contains 演講 get roleLabel '學生' (talks have no
 *    assistant — an epubParser bug hardcoded 學生/助手 for all ministry parts).
 * 2. Deletes the phantom _1 (助手) assignments on those parts.
 * 3. Adds the new 傳道演講 qual to brothers who have given a ministry talk.
 * 4. Reports (does NOT clear) sisters currently assigned to a talk's _0 slot —
 *    reassign those by hand.
 *
 * Run with: node --env-file=.env scripts/fix-ministry-talks.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TALK_QUAL = '傳道演講';

async function main() {
  const weeks = await prisma.midweekWeek.findMany({
    include: { parts: true, assignments: true },
    orderBy: { id: 'asc' },
  });

  const talkSpeakers = new Map(); // name -> congregationId
  let fixedParts = 0, deletedHelpers = 0;
  const sistersOnTalks = [];

  for (const w of weeks) {
    for (const p of w.parts) {
      if (p.section !== 'ministry' || !p.title.includes('演講')) continue;

      if (p.roleLabel !== '學生') {
        await prisma.part.update({ where: { id: p.id }, data: { roleLabel: '學生' } });
        console.log(`✓ ${w.date} part ${p.partKey}「${p.title}」roleLabel ${p.roleLabel} → 學生`);
        fixedParts++;
      }

      const helperSlot = `mw${w.id}_${p.partKey}_1`;
      const helper = w.assignments.find(a => a.slotId === helperSlot);
      if (helper) {
        await prisma.assignment.delete({ where: { slotId: helperSlot } });
        console.log(`✓ 刪除演講的幻影助手 ${helperSlot}（${helper.name}）`);
        deletedHelpers++;
      }

      const student = w.assignments.find(a => a.slotId === `mw${w.id}_${p.partKey}_0`);
      if (student) talkSpeakers.set(student.name, { congregationId: w.congregationId, date: w.date, title: p.title });
    }
  }

  let tagged = 0;
  for (const [name, info] of talkSpeakers) {
    const person = await prisma.person.findFirst({
      where: { congregationId: info.congregationId, name },
    });
    if (!person) continue;
    if (person.gender !== 'M') {
      sistersOnTalks.push(`${info.date}「${info.title}」→ ${name}`);
      continue;
    }
    if (!person.tags.includes(TALK_QUAL)) {
      await prisma.person.update({
        where: { id: person.id },
        data: { tags: [...person.tags, TALK_QUAL] },
      });
      console.log(`✓ ${name} 加上「${TALK_QUAL}」資格`);
      tagged++;
    }
  }

  console.log(`\n完成。修正節目 ${fixedParts} 個，刪除幻影助手 ${deletedHelpers} 條，加資格 ${tagged} 人。`);
  if (sistersOnTalks.length) {
    console.log('\n⚠ 以下演講目前指派給姊妹（演講只能由弟兄擔任），請手動改派：');
    sistersOnTalks.forEach(s => console.log('  ' + s));
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
