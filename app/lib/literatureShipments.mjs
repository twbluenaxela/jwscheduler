import { periodicalEntry } from './literature.mjs';

const pattern = /^(wlp|mwb|wp|w|g)(\d{2})\.(\d{1,2})$/;
export function seriesOf(code) { return pattern.exec(code)?.[1] ?? null; }
export function issueOf(code) {
  const match = pattern.exec(code);
  if (!match) return null;
  const number = Number(match[3]);
  return `${2000 + Number(match[2])}-${['g', 'wp'].includes(match[1]) ? `n${number}` : String(number).padStart(2, '0')}`;
}
export function hubLanguage(suffix) { return { CH: 'CHT', E: 'ENG', J: 'JPN' }[suffix?.toUpperCase()] ?? 'other'; }
export function splitHubCode(raw) {
  const cleaned = raw.trim().replace(/\s+[A-Za-z]{1,3}$/, '');
  const match = /^(.*)-([A-Za-z]{1,3})$/.exec(cleaned);
  return match ? { code: match[1], language: hubLanguage(match[2]) } : { code: cleaned, language: 'other' };
}
export function parsePackingSlip(text) {
  const clean = text.normalize('NFKC').replace(/[\u200B-\u200D\uFEFF]/g, '');
  const slipNumber = /裝箱單\s*(\d+)/.exec(clean)?.[1];
  if (!slipNumber) throw new Error('找不到裝箱單號碼');
  const date = /(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日/.exec(clean);
  const shippedAt = date ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}` : null;
  const rows = clean.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const header = /^(.+?)\s*\|\s*.+$/.exec(rows[i]);
    if (!header) continue;
    const title = [];
    let j = i + 1;
    while (j < rows.length && rows[j] !== '已發送的數量' && !rows[j].includes('|')) title.push(rows[j++]);
    if (rows[j] !== '已發送的數量' || !/^\d+$/.test(rows[j + 1] ?? '')) continue;
    const rawCode = header[1].trim();
    lines.push({ rawCode, ...splitHubCode(rawCode), title: title.filter(s => s !== '大字本').join(' '), largePrint: title.includes('大字本'), quantity: Number(rows[j + 1]) });
    i = j + 1;
  }
  if (!lines.length) throw new Error('找不到裝箱單品項');
  return { slipNumber, shippedAt, lines };
}
export function matchShipmentLines(lines, publications) {
  return lines.map(line => {
    const format = line.code.startsWith('wlp') || line.largePrint ? 'large' : 'standard';
    const candidates = publications.filter(p => p.code === line.code && p.language === line.language);
    const publication = candidates.find(p => p.format === format) ?? candidates.find(p => p.format === 'standard') ?? candidates[0];
    if (publication) return { ...line, publicationId: publication.id, action: 'match' };
    const series = seriesOf(line.code);
    let data = { category: 'other', name: line.title, note: '由裝箱單自動新增', issue: null };
    if (series && ['w', 'wlp', 'mwb'].includes(series)) {
      const [, , yy, number] = pattern.exec(line.code);
      data = { ...data, ...periodicalEntry(series === 'wlp' ? 'w' : series, 2000 + Number(yy), Number(number), { format }), code: line.code };
      if (series === 'mwb') data.name = `傳道與生活聚會手冊 ${2000 + Number(yy)}年${Number(number)}月`;
    } else if (series) data = { ...data, category: 'magazine', issue: issueOf(line.code), name: `${line.title} ${issueOf(line.code)}` };
    return { ...line, publicationId: null, action: 'create', createData: { ...data, code: line.code, language: line.language, format, aliases: [] } };
  });
}
const taipeiDate = (value) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(value));

export function allocateShipment({ lines, publications, subscriptions, requests, deliveries, people, shippedAt }) {
  const shippedDate = shippedAt == null ? null : taipeiDate(shippedAt);
  const same = (a, b) => String(a) === String(b);
  return lines.map(line => {
    const publication = publications.find(p => same(p.id, line.publicationId));
    const recipients = [];
    if (!publication) return { line, publication: null, recipients, allocated: 0, remainder: line.quantity };
    const add = (item, source) => {
      if (item.personId == null) return;
      const person = people.find(p => same(p.id, item.personId) && p.status !== 'inactive');
      if (!person) return;
      const matches = deliveries.filter(d => same(d.personId, person.id) && same(d.publicationId, publication.id) && same(d.shipmentId, line.shipmentId) && (source === 'request' ? same(d.requestId, item.id) : !d.requestId));
      const deliveredQuantity = matches.reduce((sum, d) => sum + d.quantity, 0);
      recipients.push({ personId: person.id, name: person.name, serviceGroup: person.serviceGroup, quantity: item.quantity, source, ...(source === 'request' ? { requestId: item.id } : {}), delivered: matches.length > 0, deliveredQuantity });
    };
    requests.filter(request => {
      if (!same(request.publicationId, publication.id)) return false;
      if (request.status === 'delivered') {
        return deliveries.some(delivery =>
          same(delivery.requestId, request.id) && same(delivery.shipmentId, line.shipmentId));
      }
      if (!['pending', 'ordered', 'received'].includes(request.status)) return false;
      return shippedDate === null || request.createdAt == null || taipeiDate(request.createdAt) <= shippedDate;
    }).forEach(request => add(request, 'request'));
    subscriptions.filter(s => s.active && s.series === seriesOf(publication.code) && s.language === publication.language).forEach(s => add(s, 'subscription'));
    recipients.sort((a, b) => (a.source === b.source ? 0 : a.source === 'request' ? -1 : 1) || (a.serviceGroup || 'Z').localeCompare(b.serviceGroup || 'Z') || a.name.localeCompare(b.name));
    let allocated = 0;
    for (const recipient of recipients) {
      if (allocated + recipient.quantity > line.quantity) recipient.short = true;
      allocated += recipient.quantity;
    }
    return { line, publication, recipients, allocated, remainder: Math.max(0, line.quantity - allocated) };
  });
}

export function pendingRecipientCount(allocation, deliveries) {
  const pending = new Set();
  for (const entry of allocation) {
    for (const recipient of entry.recipients) {
      const delivered = deliveries.some((delivery) =>
        String(delivery.personId) === String(recipient.personId) &&
        String(delivery.publicationId) === String(entry.publication?.id) &&
        (recipient.requestId ? String(delivery.requestId) === String(recipient.requestId) : !delivery.requestId));
      if (!delivered) pending.add(String(recipient.personId));
    }
  }
  return pending.size;
}

const sameHandoutId = (a, b) => String(a) === String(b);
export function handoutItem(publication, recipient, shipmentId = null) {
  const series = seriesOf(publication.code || '');
  const names = { w: '研讀版', wlp: '大字', mwb: '手冊', g: '警醒', wp: '公眾版' };
  const language = publication.language === 'ENG' ? ' 英' : publication.language === 'JPN' ? ' 日' : '';
  const issue = /\.(\d{1,2})$/.exec(publication.code || '');
  const label = series ? `${names[series]}${language}${issue ? ` ${Number(issue[1])}${['g', 'wp'].includes(series) ? '期' : '月'}` : ''}` : publication.name;
  return {
    key: `${shipmentId || 'none'}-${publication.id}-${recipient.personId}-${recipient.requestId || 'subscription'}`,
    publicationId: publication.id, code: publication.code, language: publication.language,
    format: publication.format, label, quantity: recipient.quantity, shipmentId,
    requestId: recipient.requestId || null, source: recipient.source, ...(recipient.short ? { short: true } : {}),
  };
}

export function pendingHandouts({ shipments, allocations, deliveries, requests, people }) {
  const grouped = new Map();
  const guests = [];
  const covered = new Set();
  const addedRequests = new Set();
  const add = (person, item) => {
    const key = String(person.id);
    if (!grouped.has(key)) grouped.set(key, { personId: person.id, name: person.name, serviceGroup: person.serviceGroup, groupRole: person.groupRole, items: [] });
    grouped.get(key).items.push(item);
  };
  const delivered = (personId, publicationId, requestId) => deliveries.some(d =>
    sameHandoutId(d.personId, personId) && sameHandoutId(d.publicationId, publicationId) &&
    (requestId ? sameHandoutId(d.requestId, requestId) : !d.requestId));
  for (const shipment of shipments) {
    for (const entry of allocations.get(shipment.id) || allocations.get(String(shipment.id)) || []) {
      if (!entry.publication) continue;
      for (const recipient of entry.recipients) {
        if (recipient.requestId) covered.add(String(recipient.requestId));
        if (recipient.requestId && addedRequests.has(String(recipient.requestId))) continue;
        const person = people.find(p => sameHandoutId(p.id, recipient.personId));
        if (person && !delivered(person.id, entry.publication.id, recipient.requestId)) {
          add(person, handoutItem(entry.publication, recipient, shipment.id));
          if (recipient.requestId) addedRequests.add(String(recipient.requestId));
        }
      }
    }
  }
  for (const request of requests) {
    if (request.status !== 'received' || covered.has(String(request.id)) || delivered(request.personId, request.publicationId, request.id)) continue;
    if (request.personId == null && request.publication) {
      guests.push({ personId: null, guestKey: `guest:${request.id}`, name: request.guestName, serviceGroup: null, guest: true,
        items: [handoutItem(request.publication, { ...request, requestId: request.id, source: 'request' })] });
      continue;
    }
    const person = people.find(p => sameHandoutId(p.id, request.personId) && p.status !== 'inactive');
    const publication = request.publication;
    if (person && publication) add(person, handoutItem(publication, { ...request, requestId: request.id, source: 'request' }));
  }
  const groups = ['A', 'B', 'C', 'D', 'E'];
  const roster = [...grouped.values()].sort((a, b) => {
    const group = p => groups.includes(p.serviceGroup) ? groups.indexOf(p.serviceGroup) : groups.length;
    return group(a) - group(b) || a.name.localeCompare(b.name, 'zh-Hant');
  });
  return [...roster, ...guests];
}

export function handoutSummary(items) {
  const groups = new Map();
  for (const item of items) {
    const month = /^(.*) (\d{1,2})月$/.exec(item.label);
    const code = /^(?:wlp|mwb|w)(\d{2})\.(\d{1,2})$/.exec(item.code || '');
    const base = month && code ? month[1] : item.label;
    if (!groups.has(base)) groups.set(base, new Map());
    const entries = groups.get(base);
    const issue = month && code ? `${code[1]}.${code[2].padStart(2, '0')}` : '';
    const existing = entries.get(issue);
    if (existing) existing.quantity += item.quantity;
    else entries.set(issue, { month: month && code ? `${Number(month[2])}月` : null, quantity: item.quantity });
  }
  return [...groups].map(([base, entries]) => {
    const issues = [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([, issue]) => issue);
    if (!issues[0].month) return `${base}${issues[0].quantity > 1 ? ` ×${issues[0].quantity}` : ''}`;
    const equal = issues.every(issue => issue.quantity === issues[0].quantity);
    const months = issues.map(issue => `${issue.month}${!equal && issue.quantity > 1 ? `×${issue.quantity}` : ''}`).join('·');
    return `${base} ${months}${equal && issues[0].quantity > 1 ? ` ×${issues[0].quantity}` : ''}`;
  }).join(' · ');
}
