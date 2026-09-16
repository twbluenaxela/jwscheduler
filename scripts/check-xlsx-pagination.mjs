// Verifies the midweek workbook really does print two weeks per A4 page, by
// building it and asking a real spreadsheet renderer (LibreOffice) to paginate
// it. Read-only; touches no database.
//
//   node scripts/check-xlsx-pagination.mjs
//
// WHY THIS EXISTS: midweekXlsxLayout.test.mjs measures the sheet with the same
// height model that built it, so it can only prove the PACKER is
// self-consistent. Only a renderer can show what a spreadsheet really does.
//
// Each case is rendered EIGHT ways: four page margins × (manual breaks present,
// manual breaks stripped).
//   - Stripping <rowBreaks> imitates the readers that ignore them — phone print
//     dialogs, Google Sheets.
//   - Sweeping the margins imitates a print path that overrides the margins the
//     file asks for. A phone's print dialog demonstrably does: it applied about
//     0.75in where the file asked for 0.35in, which is why a 752pt spread lost
//     its last row. Passing at 0.35in ONLY is how that shipped twice.
//
// Needs `soffice` (with libreoffice-calc) and `pdftotext` on PATH.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildMidweekStylesXml,
  buildMidweekXlsxBlob,
  buildStyledSheetXml,
  buildSheetPlan,
} from '../app/lib/midweekXlsxLayout.mjs';
import { zipXlsx } from '../app/lib/xlsx.mjs';
import { countScheduledWeeks, isMidweekSuspended } from '../app/lib/weekType.mjs';

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

// The margins a print path might impose, whatever the file asks for. 1in is well
// past anything seen in the wild and is here as headroom.
const MARGINS = [0.35, 0.6, 0.85, 1.0];

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

// Every page must OPEN with a week header (a 「N月 …日」 date). A page that starts
// mid-programme is the split-week bug: the previous page ended part-way through.
function splitPages(pdfPath) {
  let text = '';
  try {
    text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
  } catch {
    return null; // pdftotext not installed — skip this half of the check
  }
  const bad = [];
  text.split('\f').forEach((page, i) => {
    const first = page.split('\n').map((l) => l.trim()).find((l) => l.length > 0);
    if (first && !/\d+月/.test(first)) bad.push(`p${i + 1} starts with 「${first.slice(0, 24)}」`);
  });
  return bad;
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
  let passes = 0;

  for (const { name, weeks } of CASES) {
    const expected = Math.ceil(countScheduledWeeks(weeks) / 2);

    // Two builds per case. "breaks" is what we ship. "no-breaks" strips the
    // manual <rowBreaks> to imitate the readers that drop them — phone print
    // dialogs, Google Sheets — where only the filler rows keep the spreads
    // aligned. That is the case the user actually hit.
    const plan = buildSheetPlan(weeks, null, { perPage: 2, isSuspended: isMidweekSuspended });
    const builds = [];
    for (const marginIn of MARGINS) {
      for (const breaks of [plan.breaks, []]) {
        builds.push([
          `${marginIn}in ${breaks.length ? 'breaks' : 'no-breaks'}`,
          () => zipXlsx(
            buildStyledSheetXml(plan.rows, breaks, plan.pageCount, marginIn),
            buildMidweekStylesXml(),
          ),
        ]);
      }
    }

    for (const [variant, build] of builds) {
      const blob = await build();
      const xlsx = join(dir, `${name.replace(/[^\w]+/g, '_')}__${variant}.xlsx`);
      writeFileSync(xlsx, Buffer.from(await blob.arrayBuffer()));

      execFileSync('soffice', [
        '--headless', '--norestore', '--convert-to', 'pdf', '--outdir', dir, xlsx,
      ], { stdio: 'ignore', timeout: 120000 });

      const pdf = xlsx.replace(/\.xlsx$/, '.pdf');
      const pages = pdfPageCount(readFileSync(pdf));
      const split = splitPages(pdf);
      const ok = pages === expected && (split === null || split.length === 0);
      if (!ok) failures += 1;
      const detail = pages !== expected
        ? `${pages} page(s), expected ${expected}`
        : (split && split.length ? `split week — ${split.join('; ')}` : `${pages} page(s)`);
      if (ok) passes += 1;
      else console.log(`FAIL  ${`${name} [${variant}]`.padEnd(52)} ${detail}`);
    }
  }

  rmSync(dir, { recursive: true, force: true });
  if (failures) {
    console.error(`\n${failures} of ${failures + passes} renders did not paginate to two weeks per page.`);
    process.exitCode = 1;
  } else {
    console.log(`\nAll ${passes} renders print exactly two weeks per page `
      + `(${CASES.length} cases × ${MARGINS.length} margins × breaks/no-breaks).`);
  }
}

main();
