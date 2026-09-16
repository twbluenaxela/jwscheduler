// Verifies the midweek workbook really does print two weeks per A4 page, by
// building it and asking a real spreadsheet renderer (LibreOffice) to paginate
// it. Read-only; touches no database.
//
//   node scripts/check-xlsx-pagination.mjs
//
// WHY THIS EXISTS: midweekXlsxLayout.test.mjs derives the page budget from the
// same height model it builds rows with, so it can only prove the PACKER is
// self-consistent — it cannot prove our row heights match what a spreadsheet
// actually prints. That is the half of the October bug (two weeks plus half a
// week on page one) that only a renderer can catch. Needs `soffice` on PATH; it
// skips with a clear message when there isn't one.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildMidweekXlsxBlob } from '../app/lib/midweekXlsxLayout.mjs';
import { countScheduledWeeks } from '../app/lib/weekType.mjs';

let partSeq = 0;
const part = (title, extra = {}) => ({
  id: `p${partSeq += 1}`, time: '7:36', partNum: 1, title, dur: '5 分鐘', cat: 'x', assign: ['陳志強'], ...extra,
});

function shortWeek(id) {
  return {
    id,
    date: `9月 ${id}日`,
    weekdayPill: '星期三 · 19:30',
    reading: '耶利米書 1-3 章',
    chairman: '王文哲', openPrayer: '林家明', closePrayer: '許文凱',
    openSong: '84', midSong: '76', closeSong: '18', closingDur: '不超過 3 分鐘',
    treasures: [part('不要怕他們'), part('屬靈寶石'), part('經文朗讀', { roleLabel: '學生' })],
    ministry: [
      part('初次交談', { roleLabel: '學生/助手', assign: ['黃美玲', '周佩珊'] }),
      part('再次交談', { roleLabel: '學生/助手', assign: ['李淑芬', '王雅婷'] }),
      part('教導人成為門徒', { roleLabel: '學生/助手', assign: ['張美惠', '林宜蓁'] }),
    ],
    living: [part('像耶利米一樣勇敢'), part('會眾研經班', { roleLabel: '主持/朗讀', assign: ['劉政德', '蔡明杰'] })],
  };
}

// The shape that broke in October: five ministry parts and titles long enough to
// wrap onto two or three lines.
function longWeek(id) {
  return {
    ...shortWeek(id),
    date: `10月 ${id}日`,
    ministry: [
      part('初次交談 — 向住戶作見證，並且說明聖經怎樣回答這個問題', { roleLabel: '學生/助手', assign: ['黃美玲', '周佩珊'] }),
      part('再次交談 — 回覆住戶上次提出的疑問', { roleLabel: '學生/助手', assign: ['李淑芬', '王雅婷'] }),
      part('教導人成為門徒 — 運用《樂享永恆的生命》課文教導對方', { roleLabel: '學生/助手', assign: ['張美惠', '林宜蓁'] }),
      part('解釋自己的信仰 — 演講', { roleLabel: '學生' }),
      part('你會怎麼說？'),
    ],
    living: [
      part('怎樣在傳道工作上保持喜樂，即使一再遇到冷漠的反應'),
      part('會眾研經班', {
        dur: '30 分鐘',
        roleLabel: '主持/朗讀',
        assign: ['劉政德', '蔡明杰'],
        cbsRef: '《組織》第 12 章 第 1-9 段，以及附欄「怎樣善用這本書研讀聖經」和複習問題',
      }),
    ],
  };
}

const suspended = (id) => ({ ...shortWeek(id), type: 'suspended', label: '國際大會' });

const CASES = [];
for (const [name, make] of Object.entries({ short: shortWeek, long: longWeek })) {
  for (const count of [1, 2, 3, 4, 5, 7]) {
    CASES.push({ name: `${name} × ${count}`, weeks: Array.from({ length: count }, (_, i) => make(i + 1)) });
  }
}
CASES.push({
  name: 'long × 4 with a cancelled week in the middle',
  weeks: [longWeek(1), longWeek(2), suspended(3), longWeek(4), longWeek(5)],
});
CASES.push({
  name: 'mixed short/long × 6',
  weeks: Array.from({ length: 6 }, (_, i) => (i % 2 ? longWeek(i + 1) : shortWeek(i + 1))),
});

function pdfPageCount(bytes) {
  // Count page objects rather than parsing properly — enough for a generated PDF.
  const text = Buffer.from(bytes).toString('latin1');
  const counts = [...text.matchAll(/\/Type\s*\/Page[^s]/g)].length;
  const declared = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  return declared.length ? Math.max(...declared, counts) : counts;
}

async function main() {
  try {
    execFileSync('soffice', ['--version'], { stdio: 'ignore' });
  } catch {
    console.log('SKIP: soffice (LibreOffice) is not on PATH.');
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'xlsxpage-'));
  let failures = 0;

  for (const { name, weeks } of CASES) {
    const blob = await buildMidweekXlsxBlob(weeks, null);
    const xlsx = join(dir, `${name.replace(/[^\w]+/g, '_')}.xlsx`);
    writeFileSync(xlsx, Buffer.from(await blob.arrayBuffer()));

    execFileSync('soffice', [
      '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', dir, xlsx,
    ], { stdio: 'ignore', timeout: 120000 });

    const pages = pdfPageCount(readFileSync(xlsx.replace(/\.xlsx$/, '.pdf')));
    const expected = Math.ceil(countScheduledWeeks(weeks) / 2);
    const ok = pages === expected;
    if (!ok) failures += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(42)} ${pages} page(s), expected ${expected}`);
  }

  rmSync(dir, { recursive: true, force: true });
  if (failures) {
    console.error(`\n${failures} case(s) did not paginate to two weeks per page.`);
    process.exitCode = 1;
  } else {
    console.log('\nAll cases print exactly two weeks per page.');
  }
}

main();
