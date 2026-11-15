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
export function allocateShipment({ lines, publications, subscriptions, requests, deliveries, people }) {
  const same = (a, b) => String(a) === String(b);
  return lines.map(line => {
    const publication = publications.find(p => same(p.id, line.publicationId));
    const recipients = [];
    if (!publication) return { line, publication: null, recipients, allocated: 0, remainder: line.quantity };
    const add = (item, source) => {
      const person = people.find(p => same(p.id, item.personId) && p.status !== 'inactive');
      if (!person) return;
      const matches = deliveries.filter(d => same(d.personId, person.id) && same(d.publicationId, publication.id) && same(d.shipmentId, line.shipmentId) && (source === 'request' ? same(d.requestId, item.id) : !d.requestId));
      const deliveredQuantity = matches.reduce((sum, d) => sum + d.quantity, 0);
      recipients.push({ personId: person.id, name: person.name, serviceGroup: person.serviceGroup, quantity: item.quantity, source, ...(source === 'request' ? { requestId: item.id } : {}), delivered: matches.length > 0, deliveredQuantity });
    };
    requests.filter(r => (['pending', 'ordered', 'received'].includes(r.status) || (r.status === 'delivered' && deliveries.some(d => same(d.requestId, r.id) && same(d.shipmentId, line.shipmentId)))) && same(r.publicationId, publication.id)).forEach(r => add(r, 'request'));
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
