import { ensureCalendarFeed, calendarLinks } from '../calendarFeed.mjs';
import { resolveRowDate, parseIsoDate, toIsoDate } from '../cnDate.mjs';
import { resolvePerson } from './resolution.mjs';
import { slotCat } from '../partTypes.mjs';
import { CATS } from '../../data/index.js';
import { isMidweekSuspended, suspendedNotice } from '../weekType.mjs';
import { collectAssignments } from '../assignments.mjs';
import { buildPastHistory } from '../pastHistory.mjs';
import { buildCandidates } from '../candidates.mjs';
import { buildPairIndex, collectMidweekPairs, counterpartName } from '../pairHistory.mjs';
import { applyMidweekAssignment, applyWeekendPatch } from '../mutations.mjs';

const todayTaipei = () => parseIsoDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date()));
const monday = (date) => { const d = new Date(date); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d; };
export function resolveWeek(date, weeks, rows, now = todayTaipei()) {
  const offsets = { '這週': 0, '本週': 0, '下週': 1, '下下週': 2 };
  let target;
  if (!date || Object.hasOwn(offsets, date)) {
    target = monday(now);
    target.setDate(target.getDate() + 7 * (offsets[date] ?? 0));
  } else target = parseIsoDate(date) ?? resolveRowDate(date, now);
  if (!target) throw new Error('日期格式無效');
  const start = monday(target);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const inWeek = (r) => { const d = resolveRowDate(r, now); return d && d >= start && d < end; };
  const matches = weeks.filter(inWeek);
  const weekends = rows.filter(inWeek);
  if (matches.length > 1 || weekends.length > 1) throw new Error('同一週有多筆聚會資料，請在應用程式確認');
  return { week: matches[0], weekend: weekends[0], start };
}
const sections = { chairman: ['主席', 'chairman'], 主席: ['主席', 'chairman'], openPrayer: ['開會禱告', 'prayer'],
  開會禱告: ['開會禱告', 'prayer'], closePrayer: ['結束禱告', 'prayer'], 結束禱告: ['結束禱告', 'prayer'] };
const names = (week) => Object.fromEntries((week.assignments ?? []).map((a) => [a.slotId, a.name]));
export function resolvePart(week, query, role) {
  if (!week) throw new Error('找不到該週週中聚會');
  if (isMidweekSuspended(week)) throw new Error(suspendedNotice(week));
  const section = sections[query];
  if (section) {
    const key = query === '主席' ? 'chairman' : query === '開會禱告' ? 'openPrayer' : query === '結束禱告' ? 'closePrayer' : query;
    return { slotId: `mw${week.id}_${key}`, title: section[0], cat: section[1] };
  }
  const matches = (week.parts ?? []).filter((p) => String(p.partNum) === String(query) || p.title.includes(String(query)));
  const list = (week.parts ?? []).map((p) => {
    const labels = (p.roleLabel || '').split('/');
    return `${p.partNum} ${p.title} ${labels.map((label, i) => `${label || '負責'}：${names(week)[`mw${week.id}_${p.partKey}_${i}`] || '（空）'}`).join('、')}`;
  }).join('；');
  if (matches.length !== 1) throw new Error(`節目${matches.length ? '不明確' : '找不到'}：${list}`);
  const part = matches[0];
  const labels = (part.roleLabel || '').split('/');
  let idx = 0;
  if (role !== undefined && role !== '') {
    idx = ['0', '1'].includes(String(role)) ? Number(role) : labels.indexOf(String(role));
    if (idx < 0 || idx >= labels.length) throw new Error(`角色不明確：${list}`);
  } else if (labels.length > 1) throw new Error(`請指定角色：${list}`);
  return { slotId: `mw${week.id}_${part.partKey}_${idx}`, title: part.title, role: labels[idx] || '', cat: slotCat(part, idx) };
}
async function load(ctx) {
  const congregation = await ctx.db.congregation.findUnique({ where: { id: ctx.congregationId }, include: {
    people: true, weeks: { include: { parts: true, assignments: true } }, weekendRows: true,
  } });
  if (!congregation) throw new Error('找不到會眾');
  return congregation;
}
const line = (title, name) => `${title}：${name || '（空）'}`;
function formatWeek(week, row) {
  const lines = [];
  if (week) {
    lines.push(`週中 ${week.date}`);
    if (isMidweekSuspended(week)) lines.push(suspendedNotice(week));
    else {
      const a = names(week);
      for (const [key, label] of [['chairman', '主席'], ['openPrayer', '開會禱告'], ['closePrayer', '結束禱告']]) {
        lines.push(line(label, a[`mw${week.id}_${key}`]));
      }
      for (const p of week.parts ?? []) {
        const labels = (p.roleLabel || '').split('/');
        lines.push(`${p.partNum} ${p.title}：${labels.map((l, i) => line(l || '負責', a[`mw${week.id}_${p.partKey}_${i}`])).join('；')}`);
      }
    }
  }
  if (row) lines.push(`週末 ${row.date}：${[['speaker', '講者'], ['topic', '題目'], ['chair', '主席'], ['wt', '守望台主持'],
    ['read', '朗讀'], ['host', '招待'], ['away', '外出']].map(([k, l]) => line(l, row[k])).join('；')}`);
  return lines.length ? lines.join('\n') : '找不到該週聚會資料';
}
const field = (type, description, extra = {}) => ({ type, description, ...extra });
const str = (description) => field('string', description);
const num = (description) => field('integer', description);
const definition = (name, description, properties, required, handler) => ({ name, description, domain: 'schedule',
  inputSchema: { type: 'object', properties, required, additionalProperties: false }, handler });
const result = (summary, data) => ({ summary, data });
const span = (n) => { if (n < 1 || n > 12) throw new Error('週數須為 1 至 12'); return n; };
const selectedWeeks = (c, count) => {
  const start = monday(todayTaipei());
  return Array.from({ length: span(count) }, (_, index) => {
    const date = new Date(start);
    date.setDate(date.getDate() + index * 7);
    return resolveWeek(toIsoDate(date), c.weeks, c.weekendRows);
  });
};
const datePart = { date: str('日期或這週、下週'), part: str('節目編號、標題或主席、禱告'), role: str('角色或 0、1') };
export const scheduleTools = [
  definition('get_week_schedule', '查詢一週聚會安排', { date: str('日期') }, [], async (ctx, a) => {
    const c = await load(ctx);
    const { week, weekend } = resolveWeek(a.date, c.weeks, c.weekendRows);
    return result(formatWeek(week, weekend), { week: week ?? null, weekend: weekend ?? null });
  }),
  definition('get_upcoming_schedule', '查詢未來數週安排', { weeks: num('週數 1–12') }, [], async (ctx, a) => {
    const c = await load(ctx);
    const weeks = selectedWeeks(c, a.weeks ?? 4);
    const data = weeks.map(({ week, weekend, start }) => ({ week: week ?? null, weekend: weekend ?? null, start: toIsoDate(start) }));
    const summaries = data.map((x) => {
      const midweek = x.week ? `週中 ${x.week.date}${isMidweekSuspended(x.week) ? ` ${suspendedNotice(x.week)}` : ''}` : '無週中資料';
      const weekend = x.weekend ? `週末 ${x.weekend.date} ${x.weekend.speaker || '講者（空）'}` : '無週末資料';
      return `${x.start}：${midweek}；${weekend}`;
    });
    return result(summaries.join('\n'), data);
  }),
  definition('get_person_assignments', '查詢個人委派', { person: str('姓名'), include_past: field('boolean', '包含過去三個月') }, ['person'], async (ctx, a) => {
    const c = await load(ctx);
    const person = resolvePerson(a.person, c.people);
    const cutoff = todayTaipei();
    if (a.include_past) cutoff.setMonth(cutoff.getMonth() - 3);
    const items = collectAssignments(person.name, c.weeks.filter((w) => !isMidweekSuspended(w)), c.weekendRows, { today: cutoff, skipSuspended: true });
    return result(`${person.name}：\n${items.map((i) => `${i.date} ${i.role}`).join('\n') || '沒有安排'}`, { person: person.name, assignments: items });
  }),
  definition('list_vacancies', '查詢空缺', { weeks: num('週數 1–12') }, [], async (ctx, a) => {
    const c = await load(ctx);
    const vacancies = [];
    for (const { week: w, weekend: row } of selectedWeeks(c, a.weeks ?? 4)) {
      if (w && !isMidweekSuspended(w)) {
        const map = names(w);
        for (const [key, label] of [['chairman', '主席'], ['openPrayer', '開會禱告'], ['closePrayer', '結束禱告']]) {
          if (!map[`mw${w.id}_${key}`]) vacancies.push(`${w.date} ${label}`);
        }
        for (const p of w.parts ?? []) for (const [i, role] of (p.roleLabel || '').split('/').entries()) {
          if (!map[`mw${w.id}_${p.partKey}_${i}`]) vacancies.push(`${w.date} ${p.partNum} ${p.title}${role ? `（${role}）` : ''}`);
        }
      }
      if (row && row.type !== 'event' && row.type !== 'suspended') {
        const fields = [['speaker', '講者'], ['chair', '主席'], ['wt', '守望台主持'], ['read', '朗讀']];
        for (const [key, label] of fields) {
          if (!row[key]) vacancies.push(`${row.date} ${label}`);
        }
      }
    }
    return result(vacancies.join('\n') || '沒有空缺', { vacancies });
  }),
  definition('suggest_assignee', '推薦適合的成員', { ...datePart, limit: num('筆數') }, ['date', 'part'], async (ctx, a) => {
    const c = await load(ctx);
    const { week } = resolveWeek(a.date, c.weeks, c.weekendRows);
    const slot = resolvePart(week, a.part, a.role);
    const mapped = c.weeks.map((w) => ({ ...w, parts: w.parts.map((p) => ({ ...p, id: p.partKey })) }));
    const assignments = Object.assign({}, ...c.weeks.map(names));
    const ref = resolveRowDate(week);
    const history = buildPastHistory(mapped, assignments, c.weekendRows, ref);
    const pair = { with: counterpartName(slot.slotId, mapped, assignments), index: buildPairIndex(collectMidweekPairs(mapped, assignments)), ref };
    const people = c.people.map((p) => ({ ...p, g: p.gender, appt: p.appointment, quals: p.tags }));
    const current = names(week)[slot.slotId];
    const ranked = buildCandidates(people, slot.cat, false, 2, history, pair);
    const currentCandidate = ranked.find((candidate) => candidate.n === current);
    const ordered = current ? [currentCandidate || { n: current }, ...ranked.filter((candidate) => candidate.n !== current)] : ranked;
    const candidates = ordered.slice(0, Math.min(50, Math.max(1, a.limit ?? 5)))
      .map((candidate) => ({ ...candidate, current: candidate.n === current }));
    const text = candidates.map((p) => {
      const currentLabel = p.current ? '（目前已排）' : '';
      const reason = p.current ? '' : (p.d == null ? '從未擔任' : `上次 ${p.d} 天前`);
      const load = p.load > 0 ? `，半年 ${p.load} 次` : '';
      const soon = p.soon ? `（${p.u} 天後已排此項）` : '';
      const busy = p.busyNearby ? '（前後一週內另有安排）' : '';
      const paired = p.paired ? `（曾與 ${pair.with} 搭配 ${p.paired.count} 次）` : '';
      return `${p.n}${currentLabel}${reason ? `：${reason}` : ''}${load}${soon}${busy}${paired}`;
    });
    return result(text.join('\n') || '沒有符合資格的人員', { candidates });
  }),
  definition('assign_midweek', '修改週中委派', { ...datePart, person: str('姓名'), force: field('boolean', '強制指派') }, ['date', 'part', 'person'], async (ctx, a) => {
    const c = await load(ctx);
    const { week } = resolveWeek(a.date, c.weeks, c.weekendRows);
    const slot = resolvePart(week, a.part, a.role);
    const person = resolvePerson(a.person, c.people);
    if (person.status === 'inactive') throw new Error('此人目前停用');
    const cat = CATS[slot.cat];
    if (!cat) throw new Error('找不到此節目的資格類別');
    if (!a.force && (!person.tags.includes(cat.tag) || (cat.g !== 'any' && person.gender !== cat.g))) throw new Error(`此人不符合資格 ${cat.tag}；如確定仍要指派，請使用 force`);
    const before = names(week)[slot.slotId] || '（空）';
    const written = await applyMidweekAssignment(ctx.db, ctx.user, slot.slotId, person.name);
    if (written.status !== 200) throw new Error(written.body.error);
    const message = `已將 ${week.date} ${slot.title}${slot.role ? `（${slot.role}）` : ''}改為 ${person.name}（原本：${before}）`;
    return result(message, { slotId: slot.slotId, person: person.name, previous: before });
  }),
  definition('clear_midweek', '清除週中委派', datePart, ['date', 'part'], async (ctx, a) => {
    const c = await load(ctx);
    const { week } = resolveWeek(a.date, c.weeks, c.weekendRows);
    const slot = resolvePart(week, a.part, a.role);
    const previous = names(week)[slot.slotId] || '（空）';
    const written = await applyMidweekAssignment(ctx.db, ctx.user, slot.slotId, '');
    if (written.status !== 200) throw new Error(written.body.error);
    return result(`已清除 ${week.date} ${slot.title}${slot.role ? `（${slot.role}）` : ''}（原本：${previous}）`, { slotId: slot.slotId, previous });
  }),
  definition('assign_weekend', '修改週末安排', {
    date: str('日期'),
    field: field('string', '欄位', { enum: ['speaker', 'chair', 'wt', 'read', 'host', 'topic', 'cong', 'away'] }),
    value: str('內容'),
  }, ['date', 'field', 'value'], async (ctx, a) => {
    const c = await load(ctx);
    const { weekend } = resolveWeek(a.date, c.weeks, c.weekendRows);
    if (!weekend) throw new Error('找不到週末聚會');
    const value = a.value && ['chair', 'wt', 'read', 'host'].includes(a.field) ? resolvePerson(a.value, c.people).name : a.value;
    const written = await applyWeekendPatch(ctx.db, ctx.user, weekend, { [a.field]: value });
    if (written.status !== 200) throw new Error(written.body.error);
    const labels = { speaker: '講者', chair: '主席', wt: '守望台主持', read: '朗讀', host: '招待',
      topic: '題目', cong: '講者會眾', away: '外出' };
    const message = `已將 ${weekend.date} ${labels[a.field]} 改為 ${value || '（空）'}（原本：${weekend[a.field] || '（空）'}）`;
    return result(message, { field: a.field, value, previous: weekend[a.field] });
  }),
  definition('recent_changes', '查詢最近變更', { limit: num('筆數') }, [], async (ctx, a) => {
    const changes = await ctx.db.changeLog.findMany({
      where: { congregationId: ctx.congregationId }, orderBy: { createdAt: 'desc' }, take: Math.min(100, Math.max(1, a.limit ?? 10)),
    });
    const lines = changes.map((x) => `${x.date} ${x.label}：${x.prevName || '（空）'} → ${x.name || '（空）'}（${x.actorName || '未知'}）`);
    return result(lines.join('\n') || '沒有變更', { changes });
  }),
  definition('get_calendar_link', '取得個人行事曆訂閱連結', { person: str('姓名') }, ['person'], async (ctx, a) => {
    const c = await load(ctx);
    const person = resolvePerson(a.person, c.people);
    const feed = await ensureCalendarFeed(ctx.db, person);
    const links = calendarLinks(ctx.origin, feed.token, person.name);
    return result(`${person.name}的行事曆：${links.page}\n訂閱網址：${links.ics}`, {
      person: person.name, url: links.ics, page: links.page,
    });
  }),
];
