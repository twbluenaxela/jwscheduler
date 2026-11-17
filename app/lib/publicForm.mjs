import { sortPublications, mapPublication } from './literature.mjs';
import { seriesOf, standingSeriesOf } from './literatureShipments.mjs';

export const PUBLIC_SECTIONS = [
  { key: 'book', label: '書籍', icon: 'book' },
  { key: 'brochure', label: '冊子', icon: 'booklet' },
  { key: 'tracts', label: '傳單和邀請函', icon: 'tract' },
  { key: 'magazines', label: '雜誌', icon: 'magazine' },
  { key: 'workbook', label: '聚會手冊', icon: 'workbook' },
  { key: 'bible', label: '聖經', icon: 'bible' },
  { key: 'toolbox', label: '教導工具箱', icon: 'toolbox' },
  { key: 'other', label: '其他', icon: 'other' },
];

export const MAGAZINE_TABS = [
  { key: 'wp', label: '守望台公眾版' },
  { key: 'g', label: '警醒！' },
  { key: 'study', label: '守望台研讀版' },
];

export function publicSection(p) {
  const series = seriesOf(p.code || '');
  if (series === 'wp' || series === 'g') return { section: 'magazines', sub: series };
  if (series === 'w' || series === 'wlp') return { section: 'magazines', sub: 'study' };
  if (series === 'mwb') return { section: 'workbook' };
  if (p.category === 'toolbox') {
    return { section: /^(?:T-\d+|inv|jwcd)/i.test(p.code || '') ? 'tracts' : 'toolbox' };
  }
  if (p.category === 'magazine') return { section: 'magazines', sub: 'wp' };
  if (p.category === 'study') return { section: 'magazines', sub: 'study' };
  return { section: ['book', 'brochure', 'bible'].includes(p.category) ? p.category : 'other' };
}

export const STANDING_SERIES = ['w', 'wlp', 'mwb'];
// Bare catalog cards (守望台研讀版 / 聚會手冊 / 大字版) are standing-eligible too —
// only dated issue cards used to show the 定期 option in the form.
export const isStanding = (publication) => STANDING_SERIES.includes(standingSeriesOf(publication.code || ''));
export const defaultKind = (publication, guest = false) =>
  !guest && isStanding(publication) ? 'standing' : 'once';

export function publicCatalog(publications) {
  const candidates = publications.filter(p => p.active && p.requestable !== false && p.category !== 'form');
  const groups = new Map();
  for (const p of candidates) {
    const series = seriesOf(p.code);
    if (!series) continue;
    const key = JSON.stringify([series, p.language, p.format]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const allowed = new Set();
  for (const rows of groups.values()) {
    rows.sort((a, b) => {
      const issue = p => { const m = /(\d{2})\.(\d{1,2})$/.exec(p.code); return Number(m[1]) * 100 + Number(m[2]); };
      return issue(b) - issue(a);
    });
    rows.slice(0, 3).forEach(p => allowed.add(String(p.id)));
  }
  return sortPublications(candidates.filter(p => !seriesOf(p.code) || allowed.has(String(p.id)))).map(p => {
    const { id, code, name, category, language, format, coverUrl } = mapPublication(p);
    return { id, code, name, category, language, format, coverUrl, ...publicSection(p), series: standingSeriesOf(code) ?? seriesOf(code), standing: isStanding(p) };
  });
}

export function groupPeople(people) {
  return ['A', 'B', 'C', 'D', 'E', '未分組'].map(group => ({
    group,
    people: people.filter(p => p.status !== 'inactive' && (['A', 'B', 'C', 'D', 'E'].includes(p.serviceGroup) ? p.serviceGroup : '未分組') === group)
      .map(({ id, name, serviceGroup }) => ({ id: String(id), name, serviceGroup }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant')),
  }));
}

export function validateSubmission({ body, people, publications, guest = body?.guest }) {
  if (!body || typeof body !== 'object') throw new Error('輸入資料無效');
  if (body.note != null && (typeof body.note !== 'string' || body.note.trim().length > 300)) {
    throw new Error('備註不可超過 300 個字');
  }
  const note = body.note?.trim() || null;
  const hasPerson = body.personId != null && body.personId !== '';
  if (hasPerson === (guest != null)) throw new Error('請選擇一位成員或填寫訪客資料');
  let personId = null, guestName = null, guestNote = null;
  if (hasPerson) {
    const person = people.find(p => String(p.id) === String(body.personId) && p.status !== 'inactive');
    if (!person) throw new Error('找不到成員');
    personId = person.id;
  } else {
    if (typeof guest?.name !== 'string' || !guest.name.trim() || guest.name.trim().length > 30) throw new Error('姓名須為 1 至 30 個字');
    if (guest.note != null && (typeof guest.note !== 'string' || guest.note.trim().length > 200)) throw new Error('備註不可超過 200 個字');
    guestName = guest.name.trim();
    guestNote = guest.note?.trim() || null;
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) throw new Error('請選擇 1 至 30 個品項');
  const catalog = new Set(publicCatalog(publications).map(p => String(p.id)));
  const merged = new Map();
  for (const item of body.items) {
    const pub = publications.find(p => String(p.id) === String(item?.publicationId));
    if (!pub || !catalog.has(String(pub.id))) throw new Error('書刊無法申請');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new Error('數量須為 1 至 20');
    const kind = item.kind ?? defaultKind(pub, Boolean(guestName));
    if (!['once', 'standing'].includes(kind)) throw new Error('申請類型無效');
    if (kind === 'standing' && (guestName || !isStanding(pub))) throw new Error('此書刊無法定期申請');
    const key = `${pub.id}:${kind}`;
    const quantity = (merged.get(key)?.quantity || 0) + item.quantity;
    if (quantity > 20) throw new Error('合併後數量不可超過 20');
    merged.set(key, { publicationId: pub.id, quantity, kind });
  }
  return { personId, guestName, guestNote, note, items: [...merged.values()] };
}

export function flagSubmission({ items, previousSubs = [], recentCount = 0, guest = false }) {
  const reasons = [];
  if (items.some(item => item.quantity > 5)) reasons.push('數量超過 5');
  if (items.length > 10) reasons.push('超過 10 項');
  if (items.some(item => item.kind === 'standing' && previousSubs.some(s => s.active && s.series === item.series && s.language === item.language && s.quantity !== item.quantity))) reasons.push('定期變更');
  if (recentCount > 0) reasons.push('10 分鐘內重複送出');
  if (guest) reasons.push('名單外');
  return { flagged: reasons.length > 0, reason: reasons.join('、') || null };
}
