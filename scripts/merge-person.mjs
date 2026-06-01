/**
 * Merges 于靜茹 → 彭靜茹 (real name).
 * - Updates all Assignment rows that reference 于靜茹 to 彭靜茹
 * - Deletes the 于靜茹 Person record
 *
 * Run BEFORE import-assignments.mjs (or after — safe either way).
 * Run with: node --env-file=.env scripts/merge-person.mjs
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const congregation = await prisma.congregation.findFirst();
  if (!congregation) { console.error('找不到會眾。'); process.exit(1); }

  const OLD_NAME = '于靜茹';
  const NEW_NAME = '彭靜茹';

  // Verify target person exists
  const targetPerson = await prisma.person.findFirst({
    where: { congregationId: congregation.id, name: NEW_NAME },
  });
  if (!targetPerson) {
    console.error(`找不到「${NEW_NAME}」的人員記錄。請先在「人員」頁面建立。`);
    process.exit(1);
  }
  console.log(`找到目標人員：${NEW_NAME} (id=${targetPerson.id})`);

  // Update all assignments
  const updatedAssignments = await prisma.assignment.updateMany({
    where: { name: OLD_NAME },
    data: { name: NEW_NAME },
  });
  console.log(`已更新 ${updatedAssignments.count} 條指派：${OLD_NAME} → ${NEW_NAME}`);

  // Delete old person record
  const oldPerson = await prisma.person.findFirst({
    where: { congregationId: congregation.id, name: OLD_NAME },
  });
  if (oldPerson) {
    await prisma.person.delete({ where: { id: oldPerson.id } });
    console.log(`已刪除舊人員記錄：${OLD_NAME} (id=${oldPerson.id})`);
  } else {
    console.log(`沒有找到「${OLD_NAME}」的人員記錄（可能已刪除）。`);
  }

  console.log('\n完成。');
}

main().catch(console.error).finally(() => prisma.$disconnect());
