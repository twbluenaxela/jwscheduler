// One-time role migration for the SYSADMIN/ADMIN/VIEWER model.
//   node --env-file=.env scripts/set-roles.mjs [sysadminEmail]
// - Converts legacy MEMBER/GUEST users to VIEWER.
// - If an email is given, sets that user to SYSADMIN.
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();
const sysadminEmail = process.argv[2];

async function main() {
  const migrated = await db.user.updateMany({
    where: { role: { in: ['MEMBER', 'GUEST'] } },
    data: { role: 'VIEWER' },
  });
  console.log(`Converted ${migrated.count} MEMBER/GUEST → VIEWER`);

  if (sysadminEmail) {
    const user = await db.user
      .update({ where: { email: sysadminEmail }, data: { role: 'SYSADMIN' } })
      .catch(() => null);
    console.log(user ? `Set SYSADMIN: ${sysadminEmail}` : `NOT FOUND: ${sysadminEmail}`);
  } else {
    console.log('No sysadmin email passed — skipping sysadmin assignment.');
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
