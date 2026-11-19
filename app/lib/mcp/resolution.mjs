import { matchPublications, normalizeText, parseVariantHints } from '../literature.mjs';

const candidates = (items, format) => items.slice(0, 8).map(format).join('、');
export function resolvePerson(query, people) {
  if (typeof query !== 'string' || !query.trim()) throw new Error('請提供姓名');
  const q = normalizeText(query);
  const exact = people.filter((p) => normalizeText(p.name) === q);
  const matches = exact.length ? exact : people.filter((p) => normalizeText(p.name).includes(q));
  if (matches.length === 1) return matches[0];
  if (matches.length) throw new Error(`姓名不明確，候選：${candidates(matches, (p) => `${p.name}（${p.serviceGroup || '未分組'}）`)}。請向使用者確認`);
  const chars = [...q];
  const scored = people.map((p) => {
    const remaining = [...normalizeText(p.name)];
    let shared = 0;
    for (const char of chars) { const index = remaining.indexOf(char); if (index >= 0) { shared++; remaining.splice(index, 1); } }
    const score = shared + (normalizeText(p.name).length === chars.length ? 1 : 0) + (normalizeText(p.name)[0] === chars[0] ? 1 : 0);
    return { p, score };
  }).filter(({ score }) => score >= (chars.length <= 2 ? 1 : 2))
    .sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name)).slice(0, 5).map(({ p }) => p);
  if (!scored.length) throw new Error(`找不到「${query}」，請向使用者確認正確姓名`);
  throw new Error(`找不到「${query}」，可能是：${candidates(scored, (p) => `${p.name}（${p.serviceGroup || '未分組'}）`)}。請向使用者確認正確姓名後再操作`);
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
