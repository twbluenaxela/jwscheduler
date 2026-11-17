/**
 * One-time data fix: rebuild one member's 定期 list from a form submission.
 *
 * The generic 守望台研讀版 / 聚會手冊 / 大字版 cards used to be submitted as 單次
 * because the form never offered 定期 for bare catalog codes. This script drops the
 * stale 定期 rows, recreates them from the submission, and removes the now-redundant
 * 單次 requests. The submission itself is left untouched as the historical record.
 *
 * Dry run by default; pass --apply to write.
 *   node --env-file=.env scripts/fix-standing-form-items.mjs \
 *     --congregation xinwu --person 鄭裕人 --submission 7 [--apply]
 */
import { PrismaClient } from '@prisma/client';
import { standingSeriesOf } from '../app/lib/literatureShipments.mjs';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index < 0 ? fallback : args[index + 1];
};
const code = value('--congregation', 'xinwu');
const personName = value('--person');
const submissionId = value('--submission');
const apply = args.includes('--apply');

async function main() {
  if (!code || code.startsWith('--')) throw new Error('請指定會眾代碼');
  if (!personName || personName.startsWith('--')) throw new Error('請指定 --person');
  const congregation = await prisma.congregation.findUnique({ where: { code } });
  if (!congregation) throw new Error(`找不到會眾 ${code}`);
  const person = await prisma.person.findFirst({ where: { congregationId: congregation.id, name: personName } });
  if (!person) throw new Error(`找不到成員 ${personName}`);
  const submission = submissionId
    ? await prisma.literatureFormSubmission.findFirst({ where: { id: Number(submissionId), congregationId: congregation.id, personId: person.id } })
    : await prisma.literatureFormSubmission.findFirst({ where: { congregationId: congregation.id, personId: person.id }, orderBy: { createdAt: 'desc' } });
  if (!submission) throw new Error('找不到該成員的表單紀錄');

  const itemIds = submission.items.map(item => item.publicationId).filter(Boolean);
  const publications = await prisma.publication.findMany({ where: { id: { in: itemIds } } });
  const byId = new Map(publications.map(p => [p.id, p]));

  // Last write wins, matching the submit route's sequential upsert.
  const standing = new Map();
  for (const item of submission.items) {
    const pub = byId.get(item.publicationId);
    const series = pub && standingSeriesOf(pub.code);
    if (!series) continue;
    standing.set(`${series}:${pub.language}`, { series, language: pub.language, quantity: item.quantity, code: pub.code });
  }
  if (!standing.size) throw new Error('這張表單沒有可定期的品項，不進行修正');

  const oldSubs = await prisma.literatureSubscription.findMany({ where: { congregationId: congregation.id, personId: person.id } });
  const targetKeys = new Set(standing.keys());
  const outside = oldSubs.filter(s => !targetKeys.has(`${s.series}:${s.language}`));
  if (outside.length) {
    throw new Error(`以下定期不在表單內，為免誤刪已停止：${outside.map(s => `${s.series}/${s.language}`).join('、')}`);
  }

  const candidates = await prisma.literatureRequest.findMany({
    where: { congregationId: congregation.id, personId: person.id, status: { in: ['pending', 'ordered', 'received'] } },
    include: { publication: true },
  });
  const requests = candidates.filter(r => standingSeriesOf(r.publication?.code || ''));
  const requestIds = requests.map(r => r.id);
  const delivered = requestIds.length
    ? await prisma.literatureDelivery.findMany({ where: { requestId: { in: requestIds } }, select: { requestId: true } })
    : [];
  if (delivered.length) throw new Error(`單次申請已有發放紀錄，拒絕刪除：${[...new Set(delivered.map(d => d.requestId))].join('、')}`);

  const stamp = `表單 #${submission.id} 重建 ${submission.createdAt.toISOString().slice(0, 10)}`;
  console.log(`會眾：${congregation.name} (${code}) — ${apply ? '套用' : 'DRY RUN'}`);
  console.log(`成員：${person.name}　表單：#${submission.id} (${submission.createdAt.toISOString()})`);
  console.log('\n刪除舊定期：');
  for (const s of oldSubs) console.log(`  #${s.id} ${s.series}/${s.language} ×${s.quantity} active=${s.active}`);
  console.log('\n由表單重建定期：');
  for (const s of standing.values()) console.log(`  ${s.series}/${s.language} ×${s.quantity} (${s.code})`);
  console.log('\n刪除多餘單次：');
  for (const r of requests) console.log(`  #${r.id} ${r.publication.code}/${r.publication.language} ×${r.quantity} status=${r.status}`);

  if (!apply) return;
  await prisma.$transaction(async (tx) => {
    await tx.literatureSubscription.deleteMany({ where: { congregationId: congregation.id, personId: person.id } });
    await tx.literatureSubscription.createMany({
      data: [...standing.values()].map(s => ({
        congregationId: congregation.id, personId: person.id, series: s.series,
        language: s.language, quantity: s.quantity, active: true, note: stamp,
      })),
    });
    if (requestIds.length) {
      await tx.literatureRequest.deleteMany({ where: { id: { in: requestIds }, congregationId: congregation.id } });
    }
  });
  const after = await prisma.literatureSubscription.findMany({ where: { personId: person.id }, orderBy: [{ series: 'asc' }, { language: 'asc' }] });
  const leftRequests = await prisma.literatureRequest.count({ where: { personId: person.id, status: { in: ['pending', 'ordered', 'received'] } } });
  console.log(`\n完成：定期 ${after.length} 筆，未解決單次 ${leftRequests} 筆`);
  for (const s of after) console.log(`  #${s.id} ${s.series}/${s.language} ×${s.quantity} ${s.note || ''}`);
}

main()
  .catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
