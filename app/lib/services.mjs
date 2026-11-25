import { resolveRowDate, toIsoDate } from './cnDate.mjs';
import { isMidweekSuspended } from './weekType.mjs';

export const DEFAULT_CATEGORIES = [
  { key: 'field', name: '帶頭傳道', kind: 'field', positions: [] },
  { key: 'cleaning', name: '打掃', kind: 'groups', positions: ['小組'] },
  { key: 'microphone', name: '麥克風服務', kind: 'slots', positions: ['左邊', '右邊'] },
  { key: 'av', name: '影音操作', kind: 'slots', positions: ['音控', '影控'] },
  { key: 'attendant', name: '招待', kind: 'slots', positions: ['大門', '主會場'] },
  { key: 'platform', name: '講台服務', kind: 'slots', positions: ['講台'] },
].map((category, sortOrder) => ({ ...category, sortOrder }));

export function meetingDatesInMonth(month, weeks, weekendRows) {
  const dates = new Map();
  for (const [rows, kind] of [
    [weeks, 'midweek'],
    [weekendRows, 'weekend'],
  ]) {
    for (const row of rows) {
      if (kind === 'midweek' ? isMidweekSuspended(row) : ['event', 'suspended'].includes(row.type)) continue;
      const iso = toIsoDate(resolveRowDate(row));
      if (iso?.startsWith(`${month}-`) && !dates.has(iso)) {
        dates.set(iso, { iso, kind, ...(kind === 'midweek' ? { weekdayPill: row.weekdayPill } : {}) });
      }
    }
  }
  return [...dates.values()].sort((a, b) => a.iso.localeCompare(b.iso));
}

export function serviceEventsForPerson({
  person,
  categories,
  assignments,
  fieldMeetings,
  weeks,
  weekendRows,
}) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const dates = new Map();
  const meetings = (month) => {
    if (!dates.has(month)) dates.set(month, meetingDatesInMonth(month, weeks, weekendRows));
    return dates.get(month);
  };
  const events = [];
  for (const assignment of assignments) {
    const category = byId.get(assignment.categoryId);
    if (!category) continue;
    const categoryInfo = { key: category.key, name: category.name };
    if (category.kind === 'slots' && assignment.personId === person.id) {
      const meeting = meetings(assignment.date.slice(0, 7)).find((item) => item.iso === assignment.date);
      events.push({
        category: categoryInfo,
        isoDate: assignment.date,
        label: category.name + (category.positions.length === 1 ? '' : `（${assignment.position}）`),
        kind: meeting?.kind ?? 'midweek',
        weekdayPill: meeting?.weekdayPill ?? (meeting?.kind === 'weekend' ? undefined : '星期三 · 19:30'),
      });
    } else if (category.kind === 'groups' && person.serviceGroup) {
      const groups = (assignment.text || '')
        .split(/[,+]/)
        .map((group) => group.trim())
        .filter(Boolean);
      if (groups.includes(person.serviceGroup)) {
        for (const meeting of meetings(assignment.date.slice(0, 7))) {
          events.push({
            category: categoryInfo,
            isoDate: meeting.iso,
            kind: meeting.kind,
            weekdayPill: meeting.weekdayPill ?? (meeting.kind === 'midweek' ? '星期三 · 19:30' : undefined),
            label: `聚會後打掃（${groups.join('+')} 組）`,
          });
        }
      }
    }
  }
  const fieldCategory = categories.find((category) => category.kind === 'field');
  for (const meeting of fieldMeetings) {
    if (meeting.leaderId === person.id)
      events.push({
        category: fieldCategory
          ? { key: fieldCategory.key, name: fieldCategory.name }
          : { key: 'field', name: '帶頭傳道' },
        kind: 'field',
        isoDate: meeting.date,
        time: meeting.time,
        label: `帶頭傳道 · ${meeting.place}`,
        location: meeting.place,
        description: [meeting.territory, meeting.note].filter(Boolean).join('\n'),
      });
  }
  return events;
}

export function upcomingServiceItems(items, today) {
  return items
    .filter((item) => item.isoDate >= today)
    .slice()
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate) || (a.time || '').localeCompare(b.time || ''));
}

// Download name for the 服務 exports. `month` is the "YYYY-MM" the page shows, so
// a downloaded file says which month it is rather than a generic name.
export function serviceExportFilename(month, ext) {
  const [year, part] = String(month ?? '').split('-');
  const label = year && part ? `服務_${year}年${Number(part)}月` : '服務';
  return `${label}.${ext}`;
}
