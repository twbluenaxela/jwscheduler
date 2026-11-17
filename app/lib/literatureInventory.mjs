import { sortPublications } from './literature.mjs';

export function isCountable(p) {
  if (typeof p.countable === 'boolean') return p.countable;
  return p.active !== false && p.category !== 'study' && !/^(nwtls|gwt.*|ic|dpa)$/i.test(p.code);
}
export function monthOf(date) {
  const d = new Date(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
export function previousMonth(month) {
  const [year, number] = month.split('-').map(Number);
  return number === 1 ? `${year - 1}-12` : `${year}-${String(number - 1).padStart(2, '0')}`;
}
// The count includes everything received through this instant.
export function countCoveredUntil(count, now = new Date()) {
  if (count.completedAt) return new Date(count.completedAt);
  if (count.status !== 'done') return new Date(now);
  const [year, month] = count.month.split('-').map(Number);
  const monthOffset = count.source === 'jwhub-report' ? 0 : 1;
  return new Date(Date.UTC(year, month - 1 + monthOffset, 10, 15, 59, 59, 999));
}

export function receivedBetween(shipments, from, to) {
  const result = new Map();
  for (const shipment of shipments) {
    const date = new Date(shipment.shippedAt ?? shipment.createdAt);
    if ((from && date <= from) || date > to) continue;
    for (const line of shipment.lines) {
      result.set(line.publicationId, (result.get(line.publicationId) || 0) + line.quantity);
    }
  }
  return result;
}

export function receivedByPublication(shipments, month) {
  const result = new Map();
  for (const shipment of shipments) {
    if (monthOf(shipment.shippedAt || shipment.createdAt) !== month) continue;
    for (const line of shipment.lines) {
      result.set(line.publicationId, (result.get(line.publicationId) || 0) + line.quantity);
    }
  }
  return result;
}
export function buildCountLines({ publications, previousLines, received }) {
  const previous = new Map(previousLines.map((line) => [String(line.publicationId), line]));
  return publications.filter(isCountable).map((p) => ({
    publicationId: p.id,
    opening: previous.get(String(p.id))?.onHand ?? 0,
    received: received.get(p.id) ?? received.get(String(p.id)) ?? 0,
    onHand: null,
  }));
}
export function missingReceivedLines({ lines, previousLines, received, publications }) {
  const existing = new Set(lines.map((line) => String(line.publicationId)));
  const previous = new Map(previousLines.map((line) => [String(line.publicationId), line]));
  const byId = new Map(publications.map((p) => [String(p.id), p]));
  return [...received.entries()]
    .filter(([publicationId, quantity]) => {
      const publication = byId.get(String(publicationId));
      return quantity > 0 && !existing.has(String(publicationId)) && publication && isCountable(publication);
    })
    .map(([publicationId, quantity]) => ({
      publicationId,
      opening: previous.get(String(publicationId))?.onHand ?? 0,
      received: quantity,
      onHand: null,
    }));
}
export function expected(line) {
  return line.opening + line.received;
}
export function distributed(line) {
  return line.onHand == null ? null : expected(line) - line.onHand;
}
export function s28Rows(publications, lines) {
  const byId = new Map(publications.map((p) => [String(p.id), p]));
  const sorted = sortPublications(lines.map((line) => byId.get(String(line.publicationId))).filter(Boolean));
  sorted.sort((a, b) => (a.s28Order ?? Infinity) - (b.s28Order ?? Infinity));
  const byPublication = new Map(lines.map((line) => [String(line.publicationId), line]));
  return sorted.map((publication) => ({ ...byPublication.get(String(publication.id)), publication }));
}
export function parseHubInventoryReport(text) {
  const clean = text.normalize('NFKC');
  const date = /(\d{4})年\s*(\d{1,2})月\s*\|\s*([^\n]+)/.exec(clean);
  if (!date || Number(date[2]) < 1 || Number(date[2]) > 12) throw new Error('找不到庫存報告月份');
  const language = /中文/.test(date[3]) ? 'CHT' : /英文|English/i.test(date[3]) ? 'ENG' : /日文|日本語/.test(date[3]) ? 'JPN' : 'other';
  const rows = clean.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const sections = ['書籍', '冊子', '表格和用品', '傳單', '公眾版雜誌', '聖經'];
  let section = '';
  const items = [];
  for (let i = 0; i < rows.length; i++) {
    if (sections.includes(rows[i])) { section = rows[i]; continue; }
    const match = /^\(([^)]+)\)\s*(.+?)(?:\s+(\d[\d,]*))?$/.exec(rows[i]);
    if (!match || !section) continue;
    let quantity = match[3];
    if (!quantity && /^\d[\d,]*$/.test(rows[i + 1] || '')) quantity = rows[++i];
    if (quantity) items.push({ code: match[1], name: match[2], quantity: Number(quantity.replace(/,/g, '')), section });
  }
  if (!items.length) throw new Error('找不到庫存報告品項');
  return { month: `${date[1]}-${date[2].padStart(2, '0')}`, language, items };
}
export function hubReportRows(publications, lines) {
  const groups = ['聖經', '書籍', '冊子', '表格和用品', '傳單', '公眾版雜誌'];
  const rows = s28Rows(publications, lines).filter((line) => line.onHand > 0).map((line) => {
    const p = line.publication;
    const section = /^T-/i.test(p.code) ? '傳單' : p.category === 'bible' ? '聖經' :
      p.category === 'book' ? '書籍' : p.category === 'brochure' ? '冊子' :
      p.category === 'magazine' ? '公眾版雜誌' : '表格和用品';
    return { ...line, section };
  });
  return rows.sort((a, b) => groups.indexOf(a.section) - groups.indexOf(b.section) ||
    a.publication.code.localeCompare(b.publication.code));
}
