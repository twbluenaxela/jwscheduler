/**
 * Diagnostic (read-only DB): does the suggestion engine space out the two
 * "same kind of turn" families — 用心準備傳道工作 student practice and 朗讀 —
 * or does it bring the same people back within the month?
 *
 * Loads REAL people + REAL history, then replays the last N weeks' part
 * structures forward as future weeks, auto-accepting every ✦ suggestion and
 * feeding it back into history (exactly what an admin clicking ✦ every week
 * would produce). Reports, per family: assignments per calendar month, the
 * spacing between consecutive turns, and how many people never get a turn.
 *
 * Compares two engines when app/lib/suggest.old.js exists (a copy of the
 * previous version), so a change can be measured rather than asserted.
 *
 * Run from project root: node --env-file=.env scripts/sim-family-rotation.mjs
 */
import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { suggestMidweekWeek as suggestNew } from '../app/lib/suggest.js';
import { partTypeOf, slotCat } from '../app/lib/partTypes.mjs';
import { buildPairIndex, recentPairing, PAIR_REPEAT_WINDOW_DAYS } from '../app/lib/pairHistory.mjs';

const OLD_PATH = new URL('../app/lib/suggest.old.js', import.meta.url);
const suggestOld = existsSync(OLD_PATH)
  ? (await import(OLD_PATH.href)).suggestMidweekWeek
  : null;

const WEEKS_AHEAD = 26;
const FAMILIES = {
  '用心準備傳道工作': ['ministry', 'ministrytalk'],
  '朗讀': ['reading', 'cbsread'],
};
const FAMILY_OF = new Map(
  Object.entries(FAMILIES).flatMap(([f, cats]) => cats.map(c => [c, f]))
);

const prisma = new PrismaClient();
const cong = await prisma.congregation.findFirst();
const people = await prisma.person.findMany({
  where: { congregationId: cong.id, status: 'active' },
});
const weeks = await prisma.midweekWeek.findMany({
  where: { congregationId: cong.id },
  include: { parts: true, assignments: true },
  orderBy: { id: 'asc' },
});
await prisma.$disconnect();

const normalPeople = people.map(p => ({
  name: p.name, g: p.gender, quals: p.tags ?? [], status: p.status,
}));
const genderOf = Object.fromEntries(people.map(p => [p.name, p.gender]));

// ── real history (what humans actually scheduled) ────────────────────────────
function historyFromWeek(w, date) {
  const out = [];
  const partMap = new Map(w.parts.map(p => [p.partKey, p]));
  for (const a of w.assignments) {
    const role = a.slotId.match(/^mw\d+_(chairman|openPrayer|closePrayer)$/);
    if (role) {
      out.push({ name: a.name, cat: role[1] === 'chairman' ? 'chairman' : 'prayer', date });
      continue;
    }
    const m = a.slotId.match(/^mw\d+_(.+?)_([01])$/);
    const part = m && partMap.get(m[1]);
    if (!part) continue;
    out.push({
      name: a.name,
      cat: slotCat(part, m[2]),
      date,
      type: part.cat === 'ministry' ? partTypeOf(part.title) : null,
      role: m[2],
      pairId: String(part.roleLabel ?? '').includes('/') ? `${w.id}_${m[1]}` : null,
    });
  }
  return out;
}

const realHistory = weeks.flatMap(w => historyFromWeek(w, w.date));

// ── future weeks: replay real part structures forward ────────────────────────
const start = new Date(2026, 7, 26); // first simulated meeting (Wed after today)
const cn = d => `${d.getMonth() + 1}月 ${d.getDate()}日`;
// Real week dates carry no year; anchor them to the week order in the DB.
const parseCn = (str) => {
  const m = String(str ?? '').match(/(\d+)月\s*(\d+)日/);
  if (!m) return null;
  const mo = +m[1];
  // weeks run 2025-09 → 2026-09 in this congregation's data
  const yr = mo >= 9 ? 2025 : 2026;
  return new Date(yr, mo - 1, +m[2]);
};
const template = weeks.slice(-8); // the most recent 8 real weeks' shapes

function futureWeek(i) {
  const src = template[i % template.length];
  const date = new Date(start);
  date.setDate(start.getDate() + i * 7);
  const sections = { treasures: [], ministry: [], living: [] };
  for (const p of src.parts) {
    const s = sections[p.section] ? p.section : 'living';
    sections[s].push({ id: p.partKey, cat: p.cat, roleLabel: p.roleLabel ?? '', title: p.title });
  }
  return { week: { id: 9000 + i, ...sections }, date, parts: src.parts };
}

// ── simulate ─────────────────────────────────────────────────────────────────
function run(engine) {
  const history = [...realHistory];
  const log = []; // { name, date, family, cat, type, role }
  for (let i = 0; i < WEEKS_AHEAD; i++) {
    const { week, date, parts } = futureWeek(i);
    const partMap = new Map(parts.map(p => [p.partKey, p]));
    const res = engine(normalPeople, week, {}, history, date);
    for (const [slotId, name] of Object.entries(res)) {
      const m = slotId.match(/^mw\d+_(.+?)_([01])$/);
      let cat, type = null, role = null;
      if (m) {
        const part = partMap.get(m[1]);
        if (!part) continue;
        cat = slotCat(part, m[2]);
        type = part.cat === 'ministry' ? partTypeOf(part.title) : null;
        role = m[2];
      } else {
        cat = slotId.endsWith('chairman') ? 'chairman' : 'prayer';
      }
      const part = m ? partMap.get(m[1]) : null;
      const pairId = part && String(part.roleLabel ?? '').includes('/') ? `${week.id}_${m[1]}` : null;
      history.push({ name, cat, date: cn(date), type, role, pairId });
      log.push({ name, date, cat, family: FAMILY_OF.get(cat) ?? null, type, role, pairId, partCat: part?.cat ?? null });
    }
  }
  return log;
}

// gender: 'M' | 'F' | null (everyone). The 傳道示範 pool is 42 sisters to 4
// brothers, so the sisters' rotation is the one that actually matters — a
// whole-pool average hides it.
function report(label, log, gender = null) {
  const who = gender === 'F' ? '姊妹' : gender === 'M' ? '弟兄' : '全部';
  console.log(`\n${'='.repeat(64)}\n${label}（${who}）\n${'='.repeat(64)}`);
  for (const [fam, cats] of Object.entries(FAMILIES)) {
    const es = log
      .filter(e => e.family === fam && (!gender || genderOf[e.name] === gender))
      .sort((a, b) => a.date - b.date);
    const pool = normalPeople.filter(p => {
      const tags = { ministry: '傳道示範', ministrytalk: '傳道演講', reading: '經文朗讀', cbsread: '研經班朗讀' };
      return (!gender || p.g === gender) && cats.some(c => p.quals.includes(tags[c]));
    });
    if (!pool.length) continue;
    // spacing between consecutive turns in this family, per person
    const gaps = [];
    const byName = {};
    for (const e of es) (byName[e.name] ??= []).push(+e.date);
    for (const ds of Object.values(byName)) {
      ds.sort((a, b) => a - b);
      for (let i = 1; i < ds.length; i++) gaps.push((ds[i] - ds[i - 1]) / 86400000);
    }
    gaps.sort((a, b) => a - b);
    // per calendar month
    const byMonth = {};
    for (const e of es) {
      const k = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, '0')}`;
      ((byMonth[k] ??= {})[e.name] ??= 0);
      byMonth[k][e.name]++;
    }
    let three = 0, twoPlus = 0, monthPersonCells = 0;
    for (const m of Object.values(byMonth)) {
      for (const n of Object.keys(m)) {
        monthPersonCells++;
        if (m[n] >= 3) three++;
        if (m[n] >= 2) twoPlus++;
      }
    }
    const served = Object.keys(byName).length;
    console.log(`\n── ${fam} ── ${es.length} 個指派／${WEEKS_AHEAD} 週，合格人數 ${pool.length}，實際輪到 ${served} 人`);
    console.log(`   未輪到任何一次：${pool.length - served} 人`);
    console.log(`   間隔：最短 ${gaps[0] ?? '-'} 天，中位 ${gaps[Math.floor(gaps.length / 2)] ?? '-'} 天，最長 ${gaps[gaps.length - 1] ?? '-'} 天`);
    console.log(`   ≤7天（連續兩週）：${gaps.filter(g => g <= 7).length}`);
    console.log(`   ≤14天：${gaps.filter(g => g <= 14).length}`);
    console.log(`   ≤28天（同月內重複）：${gaps.filter(g => g <= 28).length} ／ 共 ${gaps.length} 個間隔`);
    console.log(`   同一月份 ≥2 次：${twoPlus}，≥3 次：${three}（共 ${monthPersonCells} 個人-月）`);
    const worst = Object.entries(byName)
      .map(([n, ds]) => {
        ds.sort((a, b) => a - b);
        let min = Infinity;
        for (let i = 1; i < ds.length; i++) min = Math.min(min, (ds[i] - ds[i - 1]) / 86400000);
        return [n, ds.length, min];
      })
      .filter(([, , min]) => min <= 14)
      .sort((a, b) => a[2] - b[2]);
    if (worst.length) {
      console.log(`   最短間隔個案：` + worst.slice(0, 8).map(([n, c, min]) => `${n}(${genderOf[n] === 'M' ? '兄' : '姊'})${min}天/${c}次`).join('、'));
    }
  }
}

// 學生／助手 pairing repeats: how often does a suggested demo pair put two
// sisters together who already served together inside the pair window?
function pairReport(label, log) {
  const realPairs = [];
  for (const w of weeks) {
    const pm = new Map(w.parts.map(x => [x.partKey, x]));
    const by = {};
    for (const a of w.assignments) {
      const m = a.slotId.match(/^mw\d+_(.+?)_([01])$/);
      if (m) (by[m[1]] ??= {})[m[2]] = a.name;
    }
    for (const [k, v] of Object.entries(by)) {
      const part = pm.get(k);
      if (part?.cat === 'ministry' && String(part.roleLabel ?? '').includes('/') && v['0'] && v['1']) {
        const d = parseCn(w.date);
        if (d) realPairs.push({ a: v['0'], b: v['1'], date: d });
      }
    }
  }
  const simPairs = [];
  const byPair = {};
  for (const e of log) {
    if (!e.pairId || e.partCat !== 'ministry') continue;
    (byPair[e.pairId] ??= { date: e.date })[e.role] = e.name;
  }
  for (const v of Object.values(byPair)) if (v['0'] && v['1']) simPairs.push({ a: v['0'], b: v['1'], date: v.date });

  // Check each simulated pair against everything that came before it.
  const known = [...realPairs];
  let repeats = 0, sisterRepeats = 0, details = [];
  for (const p of simPairs.sort((x, y) => x.date - y.date)) {
    const hit = recentPairing(buildPairIndex(known), p.a, p.b, p.date);
    if (hit) {
      repeats++;
      const both = genderOf[p.a] === 'F' && genderOf[p.b] === 'F' ? '姊妹' : '含弟兄';
      details.push(`${p.a}+${p.b} (${hit.days}天前, ${both})`);
      if (genderOf[p.a] === 'F' && genderOf[p.b] === 'F') sisterRepeats++;
    }
    known.push(p);
  }
  console.log(`\n[${label}] 傳道示範配對：模擬產生 ${simPairs.length} 組，其中 ${repeats} 組在 ${PAIR_REPEAT_WINDOW_DAYS} 天內重複（其中姊妹配對 ${sisterRepeats} 組）`);
  if (details.length) console.log('   重複:', details.slice(0, 12).join('、'));
  const distinct = new Set(simPairs.map(p => [p.a, p.b].sort().join('+'))).size;
  console.log(`   不同組合 ${distinct} / ${simPairs.length}`);
}

// Load spread: how many people got 1, 2, 3… turns in the family.
function counts(log, fam) {
  const c = {};
  for (const e of log) if (e.family === fam) c[e.name] = (c[e.name] ?? 0) + 1;
  const dist = {};
  for (const v of Object.values(c)) dist[v] = (dist[v] ?? 0) + 1;
  return { dist, top: Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 6) };
}

// Every turn one person got, in order — for eyeballing a specific case.
function trace(log, name) {
  return log.filter(e => e.name === name).sort((a, b) => a.date - b.date)
    .map(e => `${cn(e.date)} ${e.cat}${e.type ? '/' + e.type : ''}${e.role != null ? '/' + e.role : ''}`);
}

function spread(label, log) {
  for (const fam of Object.keys(FAMILIES)) {
    const { dist, top } = counts(log, fam);
    console.log(`\n[${label}] ${fam} 每人次數分布`, JSON.stringify(dist),
      '最多:', top.map(t => t.join(':')).join(' '));
  }
}

const newLog = run(suggestNew);
if (suggestOld) {
  const oldLog = run(suggestOld);
  report('舊演算法（app/lib/suggest.old.js）', oldLog, 'F');
  pairReport('舊', oldLog);
  report('舊演算法（app/lib/suggest.old.js）', oldLog);
  spread('舊', oldLog);
}
report('新演算法（家族共用資歷 + 輪替間隔上限）', newLog, 'F');
pairReport('新', newLog);
report('新演算法（家族共用資歷 + 輪替間隔上限）', newLog);
spread('新', newLog);

// Trace whoever ended up with the tightest spacing, so a bad case can be read.
const tightest = Object.entries(
  newLog.filter(e => e.family).reduce((acc, e) => ((acc[e.name] ??= []).push(+e.date), acc), {})
).map(([n, ds]) => {
  ds.sort((a, b) => a - b);
  let min = Infinity;
  for (let i = 1; i < ds.length; i++) min = Math.min(min, (ds[i] - ds[i - 1]) / 86400000);
  return [n, min];
}).sort((a, b) => a[1] - b[1])[0];
if (tightest) console.log(`\n[新] 最短間隔者 ${tightest[0]}（${tightest[1]} 天）:`, trace(newLog, tightest[0]).join(' | '));
