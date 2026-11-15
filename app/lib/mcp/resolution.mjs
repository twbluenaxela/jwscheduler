import { matchPublications, normalizeText, parseVariantHints } from '../literature.mjs';

const candidates = (items, format) => items.slice(0, 8).map(format).join('、');
export function resolvePerson(query, people) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('請提供姓名');
  const q = normalizeText(query);
  const exact = people.filter((p) => normalizeText(p.name) === q);
  const matches = exact.length ? exact : people.filter((p) => normalizeText(p.name).includes(q));
  if (matches.length === 1) return matches[0];
  const list = matches.length ? matches : people;
  throw new Error(`${matches.length ? '姓名不明確' : '找不到此人'}，候選：${candidates(list, (p) => `${p.name}（${p.serviceGroup || '未分組'}）`) || '無'}`);
}
export function resolvePublication(args, publications) {
  if (args.publication_id != null) {
    const found = publications.find((p) => String(p.id) === String(args.publication_id));
    if (!found) throw new Error('找不到書刊');
    return found;
  }
  if (typeof args.publication !== 'string' || !args.publication.trim()) throw new Error('請提供書刊名稱或代碼');
  const matches = matchPublications(args.publication, publications, { limit: publications.length });
  if (!matches.length) throw new Error('找不到書刊');
  const q = normalizeText(args.publication);
  const hints = parseVariantHints(args.publication);
  const exact = matches.filter((p) => normalizeText(p.code) === q || normalizeText(p.name) === q);
  let best = exact.length ? exact : matches;
  if (hints.language) best = best.filter((p) => p.language === hints.language);
  if (hints.format) best = best.filter((p) => p.format === hints.format);
  if (best.length === 1) return best[0];
  throw new Error(`書刊不明確，候選：${candidates(best.length ? best : matches, (p) => `${p.name} ${p.code} ${p.language} ${p.format}`)}`);
}
