/**
 * Backfills `isoDate` (and `weekStartIso`) onto MidweekWeek and WeekendRow.
 *
 * Schedule dates were historically stored as year-less display strings
 * ("6月 3日" / "8/9"), so every consumer had to infer the year from "now" with a
 * ±6-month window. Going forward the EPUB import stamps a real date (it knows
 * the year from the issue's OPF title), but existing rows need filling in.
 *
 * HOW THE YEAR IS RECOVERED — and why not by walking the table in order:
 * an obvious approach is to walk the schedule and roll the year whenever the
 * month goes down. That assumes rows were created in chronological order, and
 * they are not: issues get imported whenever they are published, so a real
 * table looks like Sept–Oct (next issue, imported early) followed by May–Aug
 * (the months just past). Walking that would read 10月 → 5月 as a year boundary
 * and date the UPCOMING September a year into the past — exactly the class of
 * bug this field exists to remove.
 *
 * So each row is dated independently with the shared ±6-month inference, which
 * is reliable near "now", and anything close to the edge of that window is
 * reported as UNCERTAIN and skipped unless --force is given. Legacy data spans
 * about a year, which fits; anything that does not is surfaced rather than
 * guessed at.
 *
 * Idempotent — rows that already have a date are left alone unless --force.
 * Read-only by default; pass --write to persist.
 *
 *   node --env-file=.env scripts/backfill-iso-dates.mjs            # dry run
 *   node --env-file=.env scripts/backfill-iso-dates.mjs --write
 */
import { PrismaClient } from '@prisma/client';
import { parseCnDate, toIsoDate } from '../app/lib/cnDate.mjs';

const prisma = new PrismaClient();
const WRITE = process.argv.includes('--write');
const FORCE = process.argv.includes('--force');

// How many months away from today the inferred date lands. The ±6-month rule
// starts guessing wrong past about 5 months back / 7 forward, so anything
// beyond that is not safe to persist.
const SAFE_BACK = 5;
const SAFE_FWD = 7;

function classify(dateStr, now) {
  const d = parseCnDate(dateStr, now);
  if (!d) return { d: null, months: null, safe: false, reason: 'unparseable' };
  const months = (d.getFullYear() - now.getFullYear()) * 12 + (d.getMonth() - now.getMonth());
  const safe = months >= -SAFE_BACK && months <= SAFE_FWD;
  return { d, months, safe, reason: safe ? null : `${months} months from today — outside the reliable window` };
}

async function main() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  console.log(`Reference date: ${toIsoDate(now)}   mode: ${WRITE ? 'WRITE' : 'dry run'}${FORCE ? ' --force' : ''}\n`);

  const congregations = await prisma.congregation.findMany({ select: { id: true, name: true } });
  let updated = 0;
  let skipped = 0;

  for (const cong of congregations) {
    const weeks = await prisma.midweekWeek.findMany({
      where: { congregationId: cong.id },
      orderBy: { id: 'asc' },
      select: { id: true, date: true, weekStart: true, isoDate: true, weekStartIso: true },
    });

    console.log(`[${cong.name}] ${weeks.length} midweek weeks`);
    for (const w of weeks) {
      if (w.isoDate && !FORCE) continue;
      const meet = classify(w.date, now);
      const start = classify(w.weekStart || w.date, now);
      if (!meet.safe || !start.safe) {
        console.log(`  SKIP ${String(w.date).padEnd(10)} ${meet.reason ?? start.reason}`);
        skipped++;
        continue;
      }
      const meetIso = toIsoDate(meet.d);
      const startIso = toIsoDate(start.d);
      console.log(`  ${String(w.date).padEnd(10)} -> ${meetIso}   (week starts ${startIso})`);
      if (WRITE) {
        await prisma.midweekWeek.update({
          where: { id: w.id },
          data: { isoDate: meetIso, weekStartIso: startIso },
        });
      }
      updated++;
    }

    const rows = await prisma.weekendRow.findMany({
      where: { congregationId: cong.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, date: true, isoDate: true },
    });
    console.log(`[${cong.name}] ${rows.length} weekend rows`);
    for (const r of rows) {
      if (r.isoDate && !FORCE) continue;
      const c = classify(r.date, now);
      if (!c.safe) {
        console.log(`  SKIP ${String(r.date).padEnd(10)} ${c.reason}`);
        skipped++;
        continue;
      }
      const iso = toIsoDate(c.d);
      console.log(`  ${String(r.date).padEnd(10)} -> ${iso}`);
      if (WRITE) await prisma.weekendRow.update({ where: { id: r.id }, data: { isoDate: iso } });
      updated++;
    }
  }

  console.log(`\n${WRITE ? 'Updated' : 'Would update'} ${updated} rows; skipped ${skipped} as unsafe to infer.`);
  if (skipped) console.log('Skipped rows keep working via inference; set their dates by re-importing the issue.');
  if (!WRITE) console.log('Dry run — re-run with --write to persist.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
