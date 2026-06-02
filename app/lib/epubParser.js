import JSZip from 'jszip';

// ── DOM text extraction ──────────────────────────────────────────────────────

function extractItems(doc) {
  const items = [];

  function walk(el) {
    const tag = el.tagName?.toUpperCase() ?? '';
    if (tag === 'ASIDE' || tag === 'FOOTER') return;

    if (tag === 'H1' || tag === 'H2' || tag === 'H3') {
      const text = el.textContent.replace(/[​　\s]+/g, ' ').trim();
      if (text) items.push({ tag, text, cls: el.getAttribute('class') ?? '' });
      return; // don't recurse into headings
    }

    if (tag === 'P') {
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (text.match(/[（(]\d+分鐘[）)]/)) {
        items.push({ tag: 'DUR', text, cls: el.getAttribute('class') ?? '' });
      }
      return;
    }

    for (const child of el.children) walk(child);
  }

  const header = doc.querySelector('header');
  if (header) for (const child of header.children) walk(child);

  const body = doc.querySelector('.bodyTxt') || doc.body;
  if (body) for (const child of body.children) walk(child);

  return items;
}

// ── Category detection ───────────────────────────────────────────────────────

function catFromTitle(title) {
  if (title.includes('經文寶石') || title.includes('屬靈寶石')) return 'gems';
  if (title.includes('經文朗讀') || title.includes('聖經朗讀')) return 'reading';
  if (title.includes('會眾研經班')) return 'cbs';
  return null; // caller determines from section
}

const MINISTRY_SHORT = ['初次交談', '再次交談', '教導人成為門徒', '解釋自己的信仰'];

function buildTitle(partTitle, durText, section) {
  if (section !== 'ministry') return partTitle;
  const isShort = MINISTRY_SHORT.some(n => partTitle === n);
  if (!isShort) return partTitle;
  // Extract description: text after duration, before first 。or （
  const afterDur = durText.replace(/^[（(]\d+分鐘[）)]\s*/, '');
  const desc = afterDur.split(/[。（(]/)[0].trim();
  return desc && desc.length <= 15 ? `${partTitle} — ${desc}` : partTitle;
}

// ── Week builder from flat items ─────────────────────────────────────────────

function buildWeekFromItems(items) {
  let section = null;
  let pendingPart = null;
  let musicCount = 0;
  let openSong = '', midSong = '', closeSong = '';
  const treasures = [], ministry = [], living = [];
  let date = '', dateLabel = '', reading = '';

  for (const item of items) {
    const { tag, text, cls } = item;

    if (tag === 'H1') {
      dateLabel = text; // e.g. "9月7-13日" — preserved for week picker
      const m = text.match(/(\d+)月\s*(\d+)/);
      if (m) date = `${m[1]}月 ${m[2]}日`;
      continue;
    }

    if (tag === 'H2') {
      if (text.includes('上帝話語的寶藏')) { section = 'treasures'; pendingPart = null; }
      else if (text.includes('用心準備傳道工作')) { section = 'ministry'; pendingPart = null; }
      else if (text.includes('基督徒的生活')) { section = 'living'; pendingPart = null; }
      else if (!section) reading = text; // first H2 in header = reading
      continue;
    }

    if (tag === 'H3') {
      // Song header
      if (cls.includes('dc-icon--music')) {
        const m = text.match(/第\s*(\d+)\s*首/);
        const num = m?.[1] ?? '';
        musicCount++;
        if (musicCount === 1) openSong = num;
        else midSong = num;
        pendingPart = null;
        continue;
      }

      // Closing 結語 (contains closing song)
      if (text.includes('結語')) {
        const m = text.match(/第\s*(\d+)\s*首/);
        if (m) closeSong = m[1];
        pendingPart = null;
        continue;
      }

      // Numbered part
      const m = text.match(/^(\d+)[．.]\s*(.*)/);
      if (m && section) {
        pendingPart = { partNum: parseInt(m[1]), title: m[2].trim(), section };
      }
      continue;
    }

    if (tag === 'DUR' && pendingPart) {
      const durM = text.match(/[（(](\d+)分鐘[）)]/);
      if (durM) {
        const dur = parseInt(durM[1]);
        const title = buildTitle(pendingPart.title, text, pendingPart.section);

        const base = { partNum: pendingPart.partNum, title, dur, durMins: dur };

        if (pendingPart.section === 'treasures') {
          const c = catFromTitle(title) ?? 'treasures';
          treasures.push({ ...base, cat: c, roleLabel: c === 'reading' ? '學生' : undefined });
        } else if (pendingPart.section === 'ministry') {
          const rLabel = title.includes('演講') ? '學生' : '學生/助手';
          ministry.push({ ...base, cat: 'ministry', roleLabel: rLabel });
        } else {
          const c = catFromTitle(title) ?? 'living';
          // For CBS, extract the book/chapter reference after the duration
          const cbsRef = c === 'cbs'
            ? text.replace(/^[（(]\d+分鐘[）)]\s*/, '').trim() || undefined
            : undefined;
          living.push({ ...base, cat: c, roleLabel: c === 'cbs' ? '主持/朗讀' : undefined, ...(cbsRef ? { cbsRef } : {}) });
        }
      }
      pendingPart = null;
    }
  }

  if (!date || !treasures.length) return null;
  return { date, dateLabel, reading, openSong, midSong, closeSong, treasures, ministry, living };
}

// ── Time calculator ──────────────────────────────────────────────────────────

function toTimeStr(totalMins) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const h12 = h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')}`;
}

function assignTimes(parsed) {
  let cursor = 19 * 60 + 36; // default: 7:36 PM (song+prayer+intro ≈ 6 min from 7:30)

  const treasures = parsed.treasures.map((p, i) => {
    const time = toTimeStr(cursor);
    cursor += p.durMins;
    return {
      id: `t${i}`, time, partNum: p.partNum, title: p.title,
      dur: `${p.dur} 分鐘`, cat: p.cat,
      ...(p.roleLabel ? { roleLabel: p.roleLabel } : {}),
      assign: Array(p.roleLabel ? p.roleLabel.split('/').length : 1).fill(''),
    };
  });

  const ministry = parsed.ministry.map((p, i) => {
    const time = toTimeStr(cursor);
    cursor += p.durMins;
    return {
      id: `m${i}`, time, partNum: p.partNum, title: p.title,
      dur: `${p.dur} 分鐘`, cat: 'ministry', roleLabel: '學生/助手',
      assign: Array(p.roleLabel ? p.roleLabel.split('/').length : 1).fill(''),
    };
  });

  // mid song ≈ 1 min gap + 5 min song
  const midSongTime = toTimeStr(cursor + 1);
  cursor += 6;

  const living = parsed.living.map((p, i) => {
    const isCbs = p.cat === 'cbs';
    const time = toTimeStr(cursor);
    cursor += p.durMins;
    return {
      id: isCbs ? 'cbs' : `l${i}`, time, partNum: p.partNum, title: p.title,
      dur: `${p.dur} 分鐘`, cat: p.cat,
      ...(p.roleLabel ? { roleLabel: p.roleLabel } : {}),
      assign: Array(p.roleLabel ? p.roleLabel.split('/').length : 1).fill(''),
    };
  });

  const closingTime = toTimeStr(cursor);
  cursor += 3;
  const closeSongTime = toTimeStr(cursor);

  return { ...parsed, treasures, ministry, midSongTime, living, closingTime, closeSongTime };
}

// ── EPUB entry point ─────────────────────────────────────────────────────────

export async function parseEpub(file) {
  const ab = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  // Locate OPF via container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('string');
  if (!containerXml) throw new Error('無效的 EPUB 檔案（找不到 container.xml）');

  const opfPath = containerXml.match(/full-path="([^"]+\.opf)"/)?.[1];
  if (!opfPath) throw new Error('無效的 EPUB 檔案（找不到 OPF）');

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfXml = await zip.file(opfPath)?.async('string');
  if (!opfXml) throw new Error('無法讀取 OPF 檔案');

  // Build manifest id→href map
  const manifest = {};
  for (const m of opfXml.matchAll(/<item[^>]+id="([^"]+)"[^>]+href="([^"]+\.xhtml)"[^>]*/g)) {
    manifest[m[1]] = m[2];
  }

  // Spine order
  const spineFiles = [...opfXml.matchAll(/<itemref[^>]+idref="([^"]+)"/g)]
    .map(m => manifest[m[1]])
    .filter(Boolean);

  const domParser = new DOMParser();
  const weeks = [];

  for (const href of spineFiles) {
    // Skip extracted scripture files and cover/nav pages
    if (href.includes('-extracted') || href.includes('toc') || href.includes('cover') || href.includes('pagenav')) continue;

    const xml = await zip.file(opfDir + href)?.async('string');
    if (!xml) continue;

    const doc = domParser.parseFromString(xml, 'application/xhtml+xml');
    const items = extractItems(doc);
    const parsed = buildWeekFromItems(items);
    if (!parsed) continue;

    const withTimes = assignTimes(parsed);
    weeks.push({
      id: weeks.length,
      date: withTimes.date,
      dateLabel: withTimes.dateLabel,
      weekdayPill: '星期三 · 19:30',
      reading: withTimes.reading,
      chairman: '',
      openPrayer: '',
      openSong: withTimes.openSong,
      openIntroTime: '7:36',
      treasures: withTimes.treasures,
      ministry: withTimes.ministry,
      midSong: withTimes.midSong,
      midSongTime: withTimes.midSongTime,
      living: withTimes.living,
      closingTime: withTimes.closingTime,
      closingDur: '不超過 3 分鐘',
      closeSongTime: withTimes.closeSongTime,
      closeSong: withTimes.closeSong,
      closePrayer: '',
      _source: 'epub',
    });
  }

  if (!weeks.length) throw new Error('找不到聚會節目。請確認這是聚會手冊 EPUB（mwb）。');
  return weeks;
}
