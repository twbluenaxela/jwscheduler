import { ensureCalendarFeed, calendarLinks } from '../calendarFeed.mjs';
import { resolveRowDate, parseIsoDate, toIsoDate } from '../cnDate.mjs';
import { resolvePerson } from './resolution.mjs';
import { canEdit, canLiterature } from '../roles.mjs';
import { slotCat } from '../partTypes.mjs';
import { CATS } from '../../data/index.js';
import { isMidweekSuspended, suspendedNotice } from '../weekType.mjs';
import { collectAssignments } from '../assignments.mjs';
import { buildPastHistory } from '../pastHistory.mjs';
import { buildCandidates } from '../candidates.mjs';
import { buildPairIndex, collectMidweekPairs, counterpartName } from '../pairHistory.mjs';
import { applyMidweekAssignment, applyWeekendPatch } from '../mutations.mjs';
import { meetingDatesInMonth, serviceEventsForPerson } from '../services.mjs';

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
export function resolveScheduleDate(date, now = todayTaipei()) {
  const offsets = { '這週': 0, '本週': 0, '下週': 1, '下下週': 2 };
  return !date || Object.hasOwn(offsets, date) ? null : parseIsoDate(date) ?? resolveRowDate(date, now);
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
  const list = partList(week);
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
function partList(week) {
  return (week.parts ?? []).map((p) => {
    const labels = (p.roleLabel || '').split('/');
    return `${p.partNum} ${p.title} ${labels.map((label, i) => `${label || '負責'}：${names(week)[`mw${week.id}_${p.partKey}_${i}`] || '（空）'}`).join('、')}`;
  }).join('；');
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
const definition = (name, description, properties, required, handler, domain = 'schedule') => ({ name, description, domain,
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
async function loadServices(ctx, from, to) {
  const date = { gte: from, ...(to ? { lte: to } : {}) };
  const [categories, assignments, fieldMeetings] = await Promise.all([
    ctx.db.serviceCategory.findMany({ where: { congregationId: ctx.congregationId }, orderBy: { sortOrder: 'asc' } }),
    ctx.db.serviceAssignment.findMany({ where: { congregationId: ctx.congregationId, date }, include: { person: { select: { name: true } } } }),
    ctx.db.fieldServiceMeeting.findMany({ where: { congregationId: ctx.congregationId, date }, include: { leader: { select: { name: true } } }, orderBy: [{ date: 'asc' }, { time: 'asc' }] }),
  ]);
  return { categories, assignments, fieldMeetings };
}
function resolveCategory(query, categories) {
  const matches = categories.filter(c => c.key === query || c.name === query);
  if (matches.length !== 1) throw new Error(`找不到或無法確定服務類別，請指定：${categories.map(c => `${c.name}（${c.key}）`).join('、')}`);
  return matches[0];
}
async function personItems(ctx, c, person, cutoff, end) {
  const from = toIsoDate(cutoff);
  const services = await loadServices(ctx, `${from.slice(0, 7)}-01`, end);
  const items = [];
  for (const [rows, midweek] of [[c.weeks, true], [c.weekendRows, false]]) {
    for (const row of rows) {
      if (midweek && isMidweekSuspended(row)) continue;
      const date = resolveRowDate(row);
      if (!date) continue;
      for (const item of collectAssignments(person.name, midweek ? [row] : [], midweek ? [] : [row], { today: cutoff, skipSuspended: true })) {
        items.push({ ...item, isoDate: toIsoDate(date), label: item.role, time: midweek ? (row.weekdayPill?.match(/\d{1,2}:\d{2}/)?.[0] || '19:30') : '10:00', kind: midweek ? 'midweek' : 'weekend' });
      }
    }
  }
  items.push(...serviceEventsForPerson({ person, ...services, weeks: c.weeks, weekendRows: c.weekendRows }).map(item => ({ ...item, time: item.time || item.weekdayPill?.match(/\d{1,2}:\d{2}/)?.[0] || (item.kind === 'weekend' ? '10:00' : '19:30') })));
  return items.filter(item => item.isoDate >= from && (!end || item.isoDate <= end)).sort((a, b) => a.isoDate.localeCompare(b.isoDate) || a.time.localeCompare(b.time));
}
function formatPersonItem(item) {
  const date = parseIsoDate(item.isoDate);
  return `${date.getMonth() + 1}/${date.getDate()}（${'日一二三四五六'[date.getDay()]}）${item.time} ${item.label}`;
}
const datePart = { date: str('日期或這週、下週'), part: str('節目編號、標題或主席、禱告'), role: str('角色或 0、1') };
export const scheduleTools = [
  definition('get_my_permissions', '查詢我的帳戶權限', {}, [], async (ctx) => {
    const role = ctx.user?.role;
    const labels = { SYSADMIN: '系統管理員', ADMIN: '管理員', VIEWER: '檢視者' };
    const canEditSchedule = canEdit(role), literature = canLiterature(ctx.user);
    const name = ctx.user?.displayName || '未知';
    return result(`您是 ${name}（${labels[role] || role || '未知'}）\n聚會安排：${canEditSchedule ? '可修改' : '僅能查看（無權限）'}\n書刊：${literature ? '可管理' : '無權限'}`, { name, role, canEditSchedule, canLiterature: literature });
  }, 'account'),
  definition('get_week_schedule', '查詢一週聚會安排，並判斷該日期是週中或週末', { date: str('日期') }, [], async (ctx, a) => {
    const c = await load(ctx);
    const { week, weekend } = resolveWeek(a.date, c.weeks, c.weekendRows);
    const date = resolveScheduleDate(a.date);
    let summary = formatWeek(week, weekend);
    if (date) {
      const label = `${date.getMonth() + 1}/${date.getDate()}`;
      const iso = toIsoDate(date);
      const opening = week?.isoDate === iso ? `${label}是週中聚會（${week.weekdayPill || '週中'}）` : weekend?.isoDate === iso ? `${label}是週末聚會` : `${label}不是聚會日；該週週中為 ${week?.isoDate || '無'}，週末為 ${weekend?.isoDate || '無'}`;
      summary = `${opening}\n${summary}`;
    }
    return result(summary, { week: week ?? null, weekend: weekend ?? null });
  }),
  definition('update_midweek_part', '修改週中節目標題、內容或時長。用於修改週中節目標題/內容/時長，例如本地需要的主題；本地需要請保留「本地需要（…）」格式，括號內的括號改用《》。不會更改負責人（用 assign_midweek）。', {
    date: str('日期'), part: str('節目編號或標題 substring'), title: str('新標題'), scenario: str('節目內容說明'), dur: str('時長'),
  }, ['date', 'part'], async (ctx, a) => {
    if (![a.title, a.scenario, a.dur].some((v) => v !== undefined)) throw new Error('請提供要修改的標題、內容或時長');
    const data = {};
    if (a.title !== undefined) { data.title = a.title.trim(); if (data.title.length < 1 || data.title.length > 200) throw new Error('標題須為 1 至 200 字'); }
    if (a.scenario !== undefined) { data.scenario = a.scenario.trim(); if (data.scenario.length > 1000) throw new Error('內容不得超過 1000 字'); }
    if (a.dur !== undefined) {
      const value = a.dur.trim(), match = value.match(/^(\d+)\s*(?:分鐘|min)?$/i);
      data.dur = match ? (Number(match[1]) >= 1 ? `${Number(match[1])} 分鐘` : (() => { throw new Error('時長格式無效'); })()) : value;
      if (data.dur.length < 1 || data.dur.length > 50) throw new Error('時長須為 1 至 50 字');
    }
    const c = await load(ctx);
    const { week } = resolveWeek(a.date, c.weeks, c.weekendRows);
    if (!week) throw new Error('找不到該週週中聚會');
    if (isMidweekSuspended(week)) throw new Error(suspendedNotice(week));
    const matches = (week.parts ?? []).filter((p) => String(p.partNum) === String(a.part) || p.title.includes(String(a.part)));
    if (matches.length !== 1) throw new Error(`節目${matches.length ? '不明確' : '找不到'}：${partList(week)}`);
    const part = matches[0];
    if (part.weekId !== week.id) throw new Error('節目資料不屬於該週');
    const before = { title: part.title, scenario: part.scenario, dur: part.dur };
    await ctx.db.part.update({ where: { id: part.id }, data });
    const after = { ...before, ...data };
    const changes = [];
    for (const [key, label] of [['title', '標題'], ['scenario', '內容'], ['dur', '時長']]) if (key in data) changes.push(`${label} ${key === 'title' ? `「${before[key] || ''}」→「${after[key]}」` : `${before[key] || '（空）'} → ${after[key] || '（空）'}`}`);
    return result(`已修改 ${week.date} 第${part.partNum}項：${changes.join('；')}`, { partId: part.id, partKey: part.partKey, before, after });
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
    const items = await personItems(ctx, c, person, cutoff);
    return result(`${person.name}：\n${items.map(formatPersonItem).join('\n') || '沒有安排'}`, { person: person.name, assignments: items });
  }),
  definition('get_my_assignments', '查詢我自己最近的委派（聚會節目＋服務）', { weeks: num('往後幾週，預設 8') }, [], async (ctx, a) => {
    const count = span(a.weeks ?? 8);
    const c = await load(ctx);
    const name = ctx.user?.displayName;
    let matches = typeof name === 'string' && name ? c.people.filter(p => p.name === name) : [];
    if (!matches.length && typeof name === 'string' && name.trim()) matches = c.people.filter(p => p.name.trim() === name.trim());
    if (matches.length !== 1) return result('無法確定您的姓名，請問您是哪一位？請使用 get_person_assignments 指定姓名查詢。', { matches: matches.map(p => p.name) });
    const person = matches[0];
    const today = todayTaipei();
    const last = new Date(today);
    last.setDate(last.getDate() + count * 7 - 1);
    const items = await personItems(ctx, c, person, today, toIsoDate(last));
    const feed = await ensureCalendarFeed(ctx.db, person);
    const page = calendarLinks(ctx.origin, feed.token, person.name).page;
    return result(`${person.name}：\n${items.map(formatPersonItem).join('\n') || '沒有安排'}\n行事曆訂閱：${page}\n訂閱後會自動出現在行事曆`, { person: person.name, assignments: items, page });
  }),
  definition('get_service_schedule', '查詢服務安排（麥克風、影音、招待、講台、打掃、帶頭傳道）', { month: str('YYYY-MM，預設本月'), category: str('類別名稱或 key，可省略') }, [], async (ctx, a) => {
    const month = a.month ?? toIsoDate(todayTaipei()).slice(0, 7);
    if (!parseIsoDate(`${month}-01`) || toIsoDate(parseIsoDate(`${month}-01`)) !== `${month}-01`) throw new Error('月份格式錯誤');
    const c = await load(ctx);
    const services = await loadServices(ctx, `${month}-01`, `${month}-31`);
    const categories = a.category ? [resolveCategory(a.category, services.categories)] : services.categories;
    const dates = meetingDatesInMonth(month, c.weeks, c.weekendRows);
    const lines = categories.map(category => {
      let rows;
      if (category.kind === 'field') rows = services.fieldMeetings.map(m => `${m.date} ${m.time} ${m.place}｜帶領：${m.leader?.name || '（空）'}｜地區：${m.territory || '（空）'}`);
      else if (category.kind === 'groups') rows = services.assignments.filter(x => x.categoryId === category.id).map(x => `${month}：${x.text || x.person?.name || '（空）'}`);
      else rows = dates.map(d => `${d.iso}：${category.positions.map(position => {
        const assignment = services.assignments.find(x => x.categoryId === category.id && x.date === d.iso && x.position === position);
        return `${position} → ${assignment?.person?.name || assignment?.text || '（空）'}`;
      }).join('；')}`);
      return `${category.name}\n${rows.join('\n') || '沒有安排'}`;
    });
    return result(lines.join('\n\n') || '沒有服務類別', { month, categories, dates, assignments: services.assignments, fieldMeetings: services.fieldMeetings });
  }),
  definition('set_service_assignment', '修改服務委派', { category: str('類別名稱或 key'), date: str('YYYY-MM-DD'), position: str('位置'), person: str('姓名，留空以清除') }, ['category', 'date', 'position', 'person'], async (ctx, a) => {
    if (!parseIsoDate(a.date) || toIsoDate(parseIsoDate(a.date)) !== a.date) throw new Error('日期格式錯誤');
    const c = await load(ctx);
    const categories = await ctx.db.serviceCategory.findMany({ where: { congregationId: ctx.congregationId } });
    const category = resolveCategory(a.category, categories);
    if (category.kind === 'field' || (category.kind === 'slots' && !category.positions.includes(a.position)) || (category.kind === 'groups' && (a.position !== '小組' || !a.date.endsWith('-01')))) throw new Error('此類別的位置或日期無效');
    const person = a.person.trim() ? resolvePerson(a.person, c.people) : null;
    const where = { categoryId: category.id, date: a.date, position: a.position, congregationId: ctx.congregationId };
    if (person) await ctx.db.serviceAssignment.upsert({ where: { categoryId_date_position: { categoryId: category.id, date: a.date, position: a.position } }, create: { ...where, personId: person.id, text: null }, update: { personId: person.id, text: null } });
    else await ctx.db.serviceAssignment.deleteMany({ where });
    return result(`已將 ${a.date} ${category.name}（${a.position}）改為 ${person?.name || '（空）'}`, { ...where, person: person?.name ?? null });
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
