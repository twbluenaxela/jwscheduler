// Pure helpers for syncing the Hub's "currently orderable" listing into the catalog.
// The listing is pasted as text by a user; nothing here touches the network or the DB.

const SECTION_LABELS = { wp: '守望台', g: '警醒', book: '書籍', brochure: '冊子', tract: '傳單' };
export const sectionLabel = (key) => SECTION_LABELS[key] || key;

const ENTRY = /^\*\s+(\S+?)-CH(\s+BR\d)?\s*\|/;
const LINK = /^\[([^\]]+)\]\([^)]+\)/;

function magazineName(section, code, fallback) {
  const m = /^([a-z]+)(\d{2})\.(\d{1,2})$/.exec(code || '');
  if (!m) return fallback;
  const year = 2000 + Number(m[2]);
  const issue = Number(m[3]);
  return section === 'g' ? `《警醒！》${year}年${issue}期` : `《守望台》${year}年${issue}期`;
}

export function parseHubList(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const sections = new Set();
  const items = [];
  const seen = new Set();
  let section = null, format = 'standard', braille = false, current = null;

  const header = (key, nextFormat = 'standard', nextBraille = false) => {
    section = key;
    format = nextFormat;
    braille = nextBraille;
    current = null;
    sections.add(key);
  };

  for (const line of lines) {
    const raw = line.trim();
    if (!raw) continue;
    if (/^守望台/.test(raw)) { header('wp'); continue; }
    if (/^警醒/.test(raw)) { header('g'); continue; }
    if (/^書籍/.test(raw)) { header('book', /大字本/.test(raw) ? 'large' : 'standard', /盲文點字/.test(raw)); continue; }
    if (/^冊子/.test(raw)) { header('brochure', /大字本/.test(raw) ? 'large' : 'standard', /盲文點字/.test(raw)); continue; }
    if (/^傳單/.test(raw)) { header('tract'); continue; }

    const entry = ENTRY.exec(raw);
    if (entry) {
      const code = entry[1];
      // Braille sections and "… BR1" style codes are not orderable titles.
      if (braille || entry[2]) { current = null; continue; }
      current = { code, name: '', specialOrder: false, section, format };
      items.push(current);
      continue;
    }
    if (/^\*\s*特別預訂/.test(raw)) {
      if (current) current.specialOrder = true;
      continue;
    }
    // Page chrome: nav links and other "* …" lines carry no " | " / "-CH".
    if (raw.startsWith('*')) continue;
    const link = LINK.exec(raw);
    if (link && current && !current.name) current.name = link[1];
  }

  const unique = [];
  for (const item of items) {
    if (item.section === 'wp' || item.section === 'g') {
      item.name = magazineName(item.section, item.code, item.name);
    }
    const key = JSON.stringify([item.code, item.format]);
    if (!seen.has(key)) { seen.add(key); unique.push(item); }
  }
  return { sections, items: unique };
}

// A CHT publication's Hub scope, or null when the catalog should never be synced.
export function scopeOf(p) {
  if (p.language && p.language !== 'CHT') return null;
  const code = p.code || '';
  if (/^other-/i.test(code)) return null;
  if (p.category === 'magazine') {
    if (/^wp\d/.test(code)) return 'wp';
    if (/^g\d/.test(code)) return 'g';
    return null;
  }
  if (p.category === 'book') return 'book';
  if (p.category === 'brochure') return 'brochure';
  if (p.category === 'toolbox' && (/^T-/i.test(code) || /^inv$/i.test(code))) return 'tract';
  return null;
}

function matchPublication(item, catalog) {
  const code = String(item.code);
  if (item.format === 'large') {
    // Hub large-print codes end in lp/ls, but the catalog often keeps them
    // under the base code with format 'large' (wcglp → wcg/large).
    const base = code.replace(/(?:lp|ls)$/i, '');
    return catalog.find((p) => String(p.code) === code && p.format === 'large')
      || (base !== code ? catalog.find((p) => String(p.code) === base && p.format === 'large') : null)
      || null; // never fall back to a standard row
  }
  const byCode = catalog.filter((p) => String(p.code) === code);
  return byCode.find((p) => p.format === item.format) || byCode[0] || null;
}

export function planOrderableSync(publications, parsed) {
  const catalog = (publications || []).filter((p) => !p.language || p.language === 'CHT');
  const matchedIds = new Set();
  const protectedIds = new Set();
  const add = [];
  const present = [];
  for (const item of parsed.items) {
    const pub = matchPublication(item, catalog);
    if (pub) {
      matchedIds.add(String(pub.id));
      present.push({ item, pub });
    } else {
      add.push(item);
      // A large item whose only catalog counterpart is an exact-code standard
      // row is a data edge case: never close or reflag that standard row.
      if (item.format === 'large') {
        const exactStandard = catalog.find((p) => String(p.code) === String(item.code) && p.format === 'standard');
        if (exactStandard) protectedIds.add(String(exactStandard.id));
      }
    }
  }

  const open = [], close = [], specialOn = [], specialOff = [];
  const activeScopes = parsed.sections;
  for (const pub of catalog) {
    const scope = scopeOf(pub);
    if (!scope || !activeScopes.has(scope)) continue;
    const isPresent = matchedIds.has(String(pub.id));
    if (isPresent) {
      if (pub.orderable === false) open.push(pub);
      if (pub.specialOrder === true) {
        const item = present.find((x) => String(x.pub.id) === String(pub.id))?.item;
        if (item && !item.specialOrder) specialOff.push(pub);
      }
    } else if (pub.orderable !== false && !protectedIds.has(String(pub.id))) {
      close.push(pub);
    }
  }
  for (const { item, pub } of present) {
    if (item.specialOrder && pub.specialOrder !== true) specialOn.push(pub);
  }

  return { add, open, close, specialOn, specialOff };
}

const CATEGORY_FOR = {
  wp: { category: 'magazine', hubGroup: '公眾版雜誌' },
  g: { category: 'magazine', hubGroup: '公眾版雜誌' },
  book: { category: 'book', hubGroup: '書籍' },
  brochure: { category: 'brochure', hubGroup: '冊子' },
  tract: { category: 'toolbox', hubGroup: '傳單' },
};

export function newPublicationFor(item) {
  const place = CATEGORY_FOR[item.section] || { category: 'book', hubGroup: '書籍' };
  return {
    code: item.code,
    name: item.name,
    category: place.category,
    hubGroup: place.hubGroup,
    language: 'CHT',
    format: item.format || 'standard',
    orderable: true,
    specialOrder: Boolean(item.specialOrder),
    active: true,
    requestable: true,
    onS28: false,
    aliases: [],
  };
}
