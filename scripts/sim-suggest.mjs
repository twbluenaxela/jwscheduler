/**
 * Simulation test: does the suggestion engine pigeonhole people (esp. sisters)
 * into the same ministry part type / role?
 *
 * 1. Loads REAL people + REAL assignment history from the DB (read-only).
 * 2. Baseline: distribution of ministry part-types per person in the human-made history.
 * 3. Simulates 26 future weeks where every suggestion is auto-accepted,
 *    then reports the same distribution + periodicity findings.
 *
 * Run from project root: node --env-file=.env <this file>
 */
import { PrismaClient } from '@prisma/client';
import { suggestMidweekWeek } from '/home/redna/jwscheduler/app/lib/suggest.js';
import { partTypeOf, slotCat } from '/home/redna/jwscheduler/app/lib/partTypes.mjs';

const prisma = new PrismaClient();

// ── Part-type classifier (by title) ──────────────────────────────────────────
function partType(title) {
  const t = String(title ?? '');
  if (t.includes('初次交談')) return '初次交談';
  if (t.includes('再次交談')) return '再次交談';
  if (t.includes('教導人成為門徒')) return '門徒課程';
  if (t.includes('解釋自己的信仰')) return t.includes('演講') ? '演講' : '解釋信仰';
  if (t.startsWith('演講')) return '演講';
  return '其他';
}

function fmt(n) { return String(n).padStart(2); }

function printDist(title, dist, peopleByName) {
  console.log(`\n=== ${title} ===`);
  const cols = ['初次交談', '再次交談', '門徒課程', '演講', '解釋信仰', '其他'];
  console.log('姓名'.padEnd(8), '性別', ...cols.map(c => c.padStart(5)), '  學生', '助手', ' 唯一類型?');
  const rows = Object.entries(dist).sort((a, b) => {
    const ga = peopleByName[a[0]]?.gender ?? '?', gb = peopleByName[b[0]]?.gender ?? '?';
    return ga.localeCompare(gb) || (totals(b[1]) - totals(a[1]));
  });
  function totals(d) { return Object.values(d.types).reduce((s, v) => s + v, 0); }
  let stuck = 0, helperOnly = 0;
  for (const [name, d] of rows) {
    const g = peopleByName[name]?.gender ?? '?';
    const total = totals(d);
    if (total === 0) continue;
    const typesUsed = Object.entries(d.types).filter(([, v]) => v > 0);
    const onlyOne = typesUsed.length === 1 && total >= 3 ? `⚠ 只有${typesUsed[0][0]}` : '';
    const hOnly = d.roles['學生'] === 0 && d.roles['助手'] >= 3 ? '⚠ 純助手' : '';
    if (onlyOne) stuck++;
    if (hOnly) helperOnly++;
    console.log(
      name.padEnd(8), g === 'M' ? '弟兄' : '姊妹',
      ...cols.map(c => fmt(d.types[c] ?? 0).padStart(5)),
      '  ' + fmt(d.roles['學生']), ' ' + fmt(d.roles['助手']),
      ' ', onlyOne, hOnly
    );
  }
  console.log(`\n→ 有 ${stuck} 人（≥3次）只被排同一種節目類型；${helperOnly} 人（≥3次）從未當過學生、只當助手`);
}

function newDist() {
  return { types: { '初次交談': 0, '再次交談': 0, '門徒課程': 0, '演講': 0, '解釋信仰': 0, '其他': 0 }, roles: { '學生': 0, '助手': 0 } };
}

// ── Load real data ────────────────────────────────────────────────────────────
const congregation = await prisma.congregation.findFirst();
const people = await prisma.person.findMany({ where: { congregationId: congregation.id, status: 'active' } });
const peopleByName = Object.fromEntries(people.map(p => [p.name, p]));
const weeks = await prisma.midweekWeek.findMany({
  where: { congregationId: congregation.id },
  include: { parts: true, assignments: true },
  orderBy: { id: 'asc' },
});

const normalPeople = people.map(p => ({ name: p.name, g: p.gender, quals: p.tags ?? [], status: p.status }));

// ── Baseline: real human-made history ─────────────────────────────────────────
const baseline = {};
for (const w of weeks) {
  const partMap = new Map(w.parts.map(p => [p.partKey, p]));
  for (const a of w.assignments) {
    const m = a.slotId.match(/^mw\d+_(.+?)_([01])$/);
    if (!m) continue;
    const part = partMap.get(m[1]);
    if (!part || part.section !== 'ministry') continue;
    const d = (baseline[a.name] ??= newDist());
    d.types[partType(part.title)]++;
    d.roles[m[2] === '0' ? '學生' : '助手']++;
  }
}
printDist(`基準：真人編排的歷史（${weeks.length} 週，DB 實際資料）`, baseline, peopleByName);

// ── Seed pastHistory from real data (same logic as the suggest API route) ────
const ROLE_TO_CAT = { chairman: 'chairman', openPrayer: 'prayer', closePrayer: 'prayer' };
const pastHistory = [];
for (const w of weeks) {
  const partMap = new Map(w.parts.map(p => [p.partKey, p]));
  for (const a of w.assignments) {
    const roleMatch = a.slotId.match(/^mw\d+_(chairman|openPrayer|closePrayer)$/);
    if (roleMatch) { pastHistory.push({ name: a.name, cat: ROLE_TO_CAT[roleMatch[1]], date: w.date }); continue; }
    const partMatch = a.slotId.match(/^mw\d+_(.+?)_([01])$/);
    if (partMatch) {
      const part = partMap.get(partMatch[1]);
      if (part) pastHistory.push({
        name: a.name,
        cat: slotCat(part, partMatch[2]),
        date: w.date,
        type: part.cat === 'ministry' ? partTypeOf(part.title) : null,
        role: partMatch[2],
      });
    }
  }
}

// ── Simulate 26 future weeks, auto-accepting every suggestion ─────────────────
// Ministry mix cycles through realistic month patterns (mirrors real EPUBs).
const MINISTRY_MIXES = [
  [ // pattern A
    { id: 'm0', title: '初次交談 — 向住戶作見證', roleLabel: '學生/助手' },
    { id: 'm1', title: '再次交談 — 向住戶作見證', roleLabel: '學生/助手' },
    { id: 'm2', title: '演講 — 《愛心》附錄A', roleLabel: '學生' }, // brothers-only in practice
  ],
  [ // pattern B
    { id: 'm0', title: '初次交談 — 在日常生活中作見證', roleLabel: '學生/助手' },
    { id: 'm1', title: '再次交談 — 在日常生活中作見證', roleLabel: '學生/助手' },
    { id: 'm2', title: '教導人成為門徒 — 《美好生命》', roleLabel: '學生/助手' },
  ],
  [ // pattern C
    { id: 'm0', title: '初次交談 — 向住戶作見證', roleLabel: '學生/助手' },
    { id: 'm1', title: '再次交談 — 向住戶作見證', roleLabel: '學生/助手' },
    { id: 'm2', title: '解釋自己的信仰 — 演講', roleLabel: '學生' }, // brothers-only in practice
  ],
];

const simDist = {};
const slotSequence = {}; // name -> [slot labels in order] for periodicity check
let sistersOnTalks = [];

const start = new Date(2026, 8, 2); // 9/2/2026, weekly onward
let weekId = 1000;

for (let i = 0; i < 26; i++) {
  const d = new Date(start); d.setDate(d.getDate() + i * 7);
  const dateStr = `${d.getMonth() + 1}月 ${d.getDate()}日`;
  const ministryParts = MINISTRY_MIXES[i % MINISTRY_MIXES.length];
  const week = {
    id: weekId + i,
    treasures: [
      { id: 't0', cat: 'treasures', roleLabel: '', title: '寶藏演講' },
      { id: 't1', cat: 'gems', roleLabel: '', title: '經文寶石' },
      { id: 't2', cat: 'reading', roleLabel: '學生', title: '經文朗讀' },
    ],
    ministry: ministryParts.map(p => ({ id: p.id, cat: 'ministry', roleLabel: p.roleLabel, title: p.title })),
    living: [
      { id: 'l0', cat: 'living', roleLabel: '', title: '生活演講' },
      { id: 'cbs', cat: 'cbs', roleLabel: '主持/朗讀', title: '會眾研經班' },
    ],
  };

  const suggestions = suggestMidweekWeek(normalPeople, week, {}, pastHistory, dateStr);

  // Accept everything: log to history + analytics
  for (const [slotId, name] of Object.entries(suggestions)) {
    const parts = slotId.split('_');
    const suffix = parts[1];
    let cat;
    if (suffix === 'chairman') cat = 'chairman';
    else if (suffix === 'openPrayer' || suffix === 'closePrayer') cat = 'prayer';
    else {
      const all = [...week.treasures, ...week.ministry, ...week.living];
      const part = all.find(p => p.id === suffix);
      if (part) {
        pastHistory.push({
          name,
          cat: slotCat(part, parts[2]),
          date: dateStr,
          type: part.cat === 'ministry' ? partTypeOf(part.title) : null,
          role: parts[2],
        });
        cat = true; // recorded above
      }
      cat = null;
    }
    if (cat) pastHistory.push({ name, cat, date: dateStr });

    // ministry analytics
    if (['m0', 'm1', 'm2'].includes(suffix)) {
      const meta = ministryParts.find(p => p.id === suffix);
      const type = partType(meta.title);
      const role = parts[2] === '0' ? '學生' : '助手';
      const dd = (simDist[name] ??= newDist());
      dd.types[type]++;
      dd.roles[role]++;
      (slotSequence[name] ??= []).push(`${suffix}_${role}`);
      if (type === '演講' && peopleByName[name]?.gender === 'F') {
        sistersOnTalks.push(`${dateStr} ${meta.title} → ${name}`);
      }
    }
  }
}

printDist('模擬：26 週全部自動接受建議（從真實歷史起步）', simDist, peopleByName);

console.log('\n=== 姊妹被排到「演講」類節目（S-38 規定演講只能由弟兄擔任）===');
if (sistersOnTalks.length === 0) console.log('（無）');
else sistersOnTalks.forEach(s => console.log('⚠ ' + s));

console.log('\n=== 週期性檢查：每人被排到的槽位序列（前 12 個）===');
for (const [name, seq] of Object.entries(slotSequence).sort((a, b) => b[1].length - a[1].length).slice(0, 15)) {
  const uniq = new Set(seq);
  console.log(`${name.padEnd(8)} ${seq.length} 次 → ${[...seq].slice(0, 12).join(' ')}${uniq.size === 1 && seq.length >= 3 ? '   ⚠ 每次都同一槽位' : ''}`);
}

await prisma.$disconnect();
