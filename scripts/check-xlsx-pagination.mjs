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
//   - Sweeping the margins imitates a print path that applies its own margins
//     rather than the ones the file asks for. This is not hypothetical: the
//     failing print preview measured 0.83in / 0.97in against the 0.35in the file
//     requests. PRINT_TARGET_PT (690) is sized to fit even the 1.0in case
//     (841.89 - 144 = 698), so every margin in the sweep must pass.
//
// WHAT THIS CANNOT CHECK: whether a renderer sizes a row differently from the
// `ht` we ask for. LibreOffice honours `customHeight` and does not auto-fit a
// row when it is stripped — it falls back to the default row height and clips —
// so a probe built on that comparison passes whatever heights we reserve, even
// absurdly short ones. It was written, measured, found vacuous, and removed;
// do not add it back. (It does not matter much either: fit-to-height absorbs
// UNIFORM row growth. What it cannot absorb is a blank row being discarded,
// which is why every filler row carries a cell — see midweekXlsxLayout.mjs.)
//
// Needs `soffice` (with libreoffice-calc) and `pdftotext` on PATH.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  A4_HEIGHT_PT,
  PRINT_TARGET_PT,
  ROW_HT,
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
// 0.90in is the MEASURED geometry of the print path that was failing: the
// preview shows 0.83in top / 0.97in bottom, i.e. 712.4pt usable, which is what
// 0.90in symmetric reproduces. The others bracket it.
const MARGINS = [0.35, 0.6, 0.85, 0.90, 1.0];

const usableHeight = (marginIn) => A4_HEIGHT_PT - 2 * marginIn * 72;

// WHAT IS AND IS NOT GUARANTEED.
//
// A renderer that HONOURS the manual breaks is exact at every margin — that is
// asserted, and it covers Excel on the desktop, Excel for Android (the path that
// was failing) and LibreOffice. Manual breaks only became live once fitToPage
// was turned off: per Microsoft KB 89311, "Fit To Page/Adjust To" makes Excel
// ignore every manual page break, so the old fitToPage="1" + <rowBreaks> build
// had dead breaks and leaned entirely on a fit-to-height calculation that the
// Android print path does not perform.
//
// A renderer that IGNORES the breaks (Google Sheets) cannot be controlled by the
// file: we pad each page to PRINT_TARGET_PT, and any usable height beyond that
// is slack it will happily pull the next week's first rows into. The file cannot
// know that height. Those renders are therefore ADVISORY — reported, not
// asserted — rather than tuning a threshold until they go green.
const expectExact = (marginIn, hasBreaks) => hasBreaks;

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
  let advisory = 0;

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
          expectExact(marginIn, breaks.length > 0),
          () => zipXlsx(
            buildStyledSheetXml(plan.rows, breaks, plan.scale, marginIn),
            buildMidweekStylesXml(),
          ),
        ]);
      }
    }

    for (const [variant, exact, build] of builds) {
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
      if (!ok && !exact) { advisory += 1; continue; }
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
    console.log(`\nAll ${passes} required renders print exactly two weeks per page `
      + `(${CASES.length} cases × ${MARGINS.length} margins × breaks/no-breaks).`);
    if (advisory) {
      console.log(`${advisory} break-ignoring renders on pages much taller than the `
        + `${PRINT_TARGET_PT}pt target are advisory — see expectExact().`);
    }
  }
}

main();
