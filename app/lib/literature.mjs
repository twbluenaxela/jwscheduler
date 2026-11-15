export const CATEGORY_LABELS = {
  bible: '聖經',
  toolbox: '教導工具箱',
  book: '書籍',
  brochure: '冊子',
  form: '表格',
  magazine: '公眾版雜誌',
  study: '研讀版／手冊',
  other: '其他',
};
export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
export const FORMAT_LABELS = { standard: '一般', large: '大字版', pocket: '袖珍本', other: '其他' };
export const LANGUAGE_LABELS = { CHT: '中文', ENG: '英文', JPN: '日文', other: '其他' };

export function normalizeText(s) {
  return String(s ?? '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .toLowerCase()
    .replace(/[\s《》「」()（）·]/g, '');
}
export function parseVariantHints(query) {
  let rest = normalizeText(query),
    format = null,
    language = null;
  rest = rest.replace(/大字版|大字本|放大本|大字|袖珍本|袖珍|lp|大/g, (m) => {
    format = m.startsWith('袖珍') ? 'pocket' : 'large';
    return '';
  });
  rest = rest.replace(/english|英文|日文|中文|英|日|中/g, (m) => {
    language = m === 'english' || m.startsWith('英') ? 'ENG' : m.startsWith('日') ? 'JPN' : 'CHT';
    return '';
  });
  return { rest, format, language };
}
export function sortPublications(list) {
  const category = (x) => {
    const i = CATEGORY_ORDER.indexOf(x);
    return i < 0 ? CATEGORY_ORDER.length : i;
  };
  return [...list].sort(
    (a, b) =>
      category(a.category) - category(b.category) ||
      (a.s28Order ?? Infinity) - (b.s28Order ?? Infinity) ||
      a.code.localeCompare(b.code) ||
      a.language.localeCompare(b.language) ||
      a.format.localeCompare(b.format),
  );
}
export function matchPublications(query, list, { limit = 20 } = {}) {
  const active = sortPublications(list.filter((p) => p.active !== false));
  const raw = normalizeText(query);
  if (!raw) return active.slice(0, limit);
  const { rest, format, language } = parseVariantHints(query);
  return active
    .map((p, index) => {
      const code = normalizeText(p.code),
        names = [p.name, ...(p.aliases ?? [])].map(normalizeText);
      const hintlessNames = names.map((n) => parseVariantHints(n).rest);
      let score = 0;
      if (raw === code) score = 1000;
      else if (rest && code.startsWith(rest)) score = 800;
      else if (rest && (names.includes(rest) || hintlessNames.includes(rest))) score = 600;
      else if (rest && names.some((n) => n.includes(rest))) score = 400;
      else if (rest && normalizeText(p.itemNumber) === rest) score = 200;
      else if (!rest) score = 1;
      if (!score) return { p, index, score: 0 };
      if (format) score += p.format === format ? 80 : -80;
      if (language) score += p.language === language ? 80 : -80;
      return { p, index, score };
    })
    .filter((x) => x.score !== 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.p);
}
export function periodicalEntry(kind, year, month, { format } = {}) {
  if (
    !['w', 'mwb'].includes(kind) ||
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error('無效的期刊日期');
  }
  const largeStudy = kind === 'w' && format === 'large';
  const prefix = largeStudy ? 'wlp' : kind;
  const title = largeStudy ? '守望台研讀版（大字版）' : kind === 'w' ? '守望台研讀版' : '聚會手冊';
  const paddedMonth = String(month).padStart(2, '0');
  return {
    code: `${prefix}${String(year).slice(-2)}.${paddedMonth}`,
    issue: `${year}-${paddedMonth}`,
    category: 'study',
    name: `${title} ${year}年${month}月`,
  };
}
export function seedRowsFor(congregationId, seedJson) {
  return seedJson.map((row) => ({ ...row, congregationId, aliases: row.aliases ?? [] }));
}

export function publicationPayload(body, partial = false) {
  const data = {};
  for (const key of [
    'code',
    'name',
    'category',
    'language',
    'format',
    'itemNumber',
    'issue',
    'note',
  ]) {
    if (key in body) {
      if (body[key] != null && typeof body[key] !== 'string') throw new Error('書刊欄位格式無效');
      data[key] = body[key]?.trim() || (['itemNumber', 'issue', 'note'].includes(key) ? null : '');
    }
  }
  if (!partial) {
    data.language ??= 'CHT';
    data.format ??= 'standard';
  }
  if (((!partial || 'code' in data) && !data.code) || ((!partial || 'name' in data) && !data.name))
    throw new Error('代號和名稱為必填');
  if ((!partial || 'category' in data) && !Object.hasOwn(CATEGORY_LABELS, data.category))
    throw new Error('無效的書刊類別');
  if ('format' in data && !Object.hasOwn(FORMAT_LABELS, data.format))
    throw new Error('無效的書刊格式');
  if ('language' in data && !data.language) throw new Error('語言為必填');
  if ('aliases' in body) {
    if (
      !Array.isArray(body.aliases) ||
      body.aliases.length > 20 ||
      body.aliases.some((a) => typeof a !== 'string')
    )
      throw new Error('別名格式無效');
    data.aliases = body.aliases.map((a) => a.trim());
  } else if (!partial) data.aliases = [];
  for (const key of ['active', 'onS28', 'requestable'])
    if (key in body) {
      if (typeof body[key] !== 'boolean') throw new Error('書刊欄位格式無效');
      data[key] = body[key];
    }
  if ('countable' in body) {
    if (body.countable !== null && typeof body.countable !== 'boolean') throw new Error('書刊欄位格式無效');
    data.countable = body.countable;
  }
  if ('s28Order' in body) {
    if (body.s28Order !== null && (!Number.isInteger(body.s28Order) || body.s28Order < 1))
      throw new Error('排序格式無效');
    data.s28Order = body.s28Order;
  }
  return data;
}
export function mapPublication(p) {
  const {
    id,
    code,
    name,
    category,
    language,
    format,
    itemNumber,
    aliases,
    issue,
    note,
    onS28,
    s28Order,
    active,
    coverToken,
    countable,
    requestable,
  } = p;
  return {
    id: String(id),
    code,
    name,
    category,
    language,
    format,
    itemNumber,
    aliases,
    issue,
    note,
    onS28,
    s28Order,
    active,
    countable,
    requestable,
    coverUrl: coverToken ? `/api/literature/covers/${coverToken}` : null,
  };
}

export function withCoverFallback(items) {
  const covers = new Map();
  for (const item of items) {
    const key = JSON.stringify([item.code, item.format]);
    if (item.coverUrl && !covers.has(key)) covers.set(key, item.coverUrl);
  }
  return items.map((item) => {
    const coverUrl = covers.get(JSON.stringify([item.code, item.format]));
    return !item.coverUrl && coverUrl ? { ...item, coverUrl } : item;
  });
}
