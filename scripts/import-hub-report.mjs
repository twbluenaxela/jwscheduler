import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { pdfToText } from '../app/lib/pdfText.js';
import { parseHubInventoryReport } from '../app/lib/literatureInventory.mjs';
import { importHubReport, matchHubReport } from '../app/lib/inventoryServer.js';

const args = process.argv.slice(2);
let pdf;
let congregationCode = 'xinwu';
let apply = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--apply') apply = true;
  else if (args[i] === '--congregation' && args[i + 1] && !args[i + 1].startsWith('--')) {
    congregationCode = args[++i];
  } else if (!args[i].startsWith('-') && !pdf) pdf = args[i];
  else throw new Error('用法：import-hub-report.mjs <pdf> [--congregation xinwu] [--apply]');
}
if (!pdf) throw new Error('用法：import-hub-report.mjs <pdf> [--congregation xinwu] [--apply]');

const client = new PrismaClient();
try {
  const report = parseHubInventoryReport(await pdfToText(await readFile(pdf)));
  const congregation = await client.congregation.findUnique({ where: { code: congregationCode } });
  if (!congregation) throw new Error(`找不到會眾：${congregationCode}`);
  const publications = await client.publication.findMany({ where: { congregationId: congregation.id } });
  const rows = matchHubReport(report, publications);
  const matched = rows.filter((row) => row.action === 'match').length;
  console.log(`${report.month} · ${congregation.code} · 已配對 ${matched} 項 · 待新增 ${rows.length - matched} 項`);
  if (apply) {
    const count = await importHubReport(congregation.id, report, { db: client });
    console.log(`已匯入清點 ${count.id}`);
  } else {
    console.log('預覽模式：未寫入資料庫');
  }
} finally {
  await client.$disconnect();
}
