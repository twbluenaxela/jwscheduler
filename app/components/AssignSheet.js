'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { CATS } from '../data/index';

function hash(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function daysSince(name, tag) { return 5 + (hash(name + '·' + tag) % 68); }
function loadTerm(name, tag)  { return 1 + (hash(tag + '#' + name) % 6); }

function buildCandidates(people, catKey, jitter, spread) {
  const c = CATS[catKey];
  if (!c || !people?.length) return [];
  return people
    .filter(p => p.status !== 'inactive' && p.quals.includes(c.tag) && (c.g === 'any' || p.g === c.g))
    .map(p => {
      const d = daysSince(p.name, c.tag);
      let w = Math.pow(d, spread);
      const recent = d < 14;
      if (recent) w *= 0.1;
      if (jitter) w *= 0.55 + Math.random() * 0.9;
      return { n: p.name, g: p.g, a: p.appt, d, w, recent, load: loadTerm(p.name, c.tag) };
    })
    .sort((a, b) => b.w - a.w);
}

export default function AssignSheet({ sheet, assignments, getAssign, onPick, onClose, people }) {
  const [query, setQuery] = useState('');
  const [jitter, setJitter] = useState(false);
  const [spread, setSpread] = useState(2);
  const [list, setList] = useState([]);
  const [manual, setManual] = useState('');
  const inputRef = useRef(null);

  const currentName = getAssign(sheet.slotId, sheet.defaultName);

  // Names already assigned to other slots in the same week
  const weekPrefix = sheet.slotId.split('_')[0];
  const usedThisWeek = new Set(
    Object.entries(assignments ?? {})
      .filter(([k, v]) => k !== sheet.slotId && k.startsWith(weekPrefix + '_') && v)
      .map(([, v]) => v)
  );

  const rebuild = useCallback((j) => {
    setList(buildCandidates(people, sheet.catKey, j, spread));
  }, [people, sheet.catKey, spread]);

  useEffect(() => {
    setQuery('');
    setManual('');
    setJitter(false);
    setSpread(2);
    setList(buildCandidates(people, sheet.catKey, false, 2));
    setTimeout(() => inputRef.current?.focus(), 120);
  }, [sheet, people]);

  useEffect(() => {
    if (!sheet) return;
    rebuild(jitter);
  }, [spread, jitter, rebuild, sheet]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cat = CATS[sheet.catKey] ?? {};
  const filtered = query
    ? list.filter((c) => c.n.includes(query))
    : list;
  const maxW = Math.max(...list.map((c) => c.w), 1);

  const total = list.length;
  const excluded = (people ?? []).filter(p =>
    p.status !== 'inactive' && !(p.quals.includes(cat.tag) && (cat.g === 'any' || p.g === cat.g))
  ).length;

  function pick(name) {
    onPick(sheet.slotId, name, currentName);
  }

  function clearAssign() {
    onPick(sheet.slotId, '', currentName);
  }

  return (
    <div
      className="sheet-backdrop open"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheet__grab" />
        <header className="sheet__head">
          <div className="sheet__heads">
            <div className="sheet__role">{cat.name ?? sheet.catKey}</div>
            <div className="sheet__ctx">
              {sheet.ctxLabel}
              {currentName ? `　·　目前：${currentName}` : '　·　尚未指派'}
            </div>
          </div>
          <button className="sheet__close" aria-label="關閉" onClick={onClose}>✕</button>
        </header>

        <div className="sheet__tools">
          <div className="search sheet__search">
            <span className="search__ic">⌕</span>
            <input
              ref={inputRef}
              placeholder="搜尋姓名…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            className="btn reshuffle"
            onClick={() => { setJitter(true); rebuild(true); }}
          >
            <span className="rs-ic">↻</span> 重新推薦
          </button>
        </div>

        <div className="sheet__spread">
          <div className="sheet__spread-row">
            <span className="sheet__spread-label">公平強度</span>
            <span className="sheet__spread-value">{spread.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min="1"
            max="3"
            step="0.1"
            value={spread}
            onChange={(e) => setSpread(Number(e.target.value))}
          />
          <div className="sheet__spread-hint">低 = 較平均 · 高 = 更偏向久未擔任的人選</div>
        </div>

        <button type="button" className="sheet__clear" onClick={clearAssign}>
          ✕ 留空此項{currentName ? `（清除「${currentName}」）` : ''}
        </button>

        <div className="sheet__list">
          {filtered.length === 0 ? (
            <div className="cand-empty">查無符合的人選</div>
          ) : (
            filtered.map((c, i) => {
              const rec = i === 0 && !query && !c.recent;
              const pct = Math.round((c.w / maxW) * 100);
              const isCur = currentName === c.n;
              const isUsed = !isCur && usedThisWeek.has(c.n);
              return (
                <button
                  key={c.n}
                  className={`cand${rec ? ' is-rec' : ''}${isCur ? ' is-cur' : ''}${isUsed ? ' is-used' : ''}`}
                  onClick={() => pick(c.n)}
                >
                  <span className={`avatar ${c.g === 'M' ? 'g-m' : 'g-f'}`}>
                    {c.n.slice(0, 1)}
                  </span>
                  <div className="cand__body">
                    <div className="cand__top">
                      <span className="cand__name">{c.n}</span>
                      <span className={`g-badge ${c.g === 'M' ? 'g-m' : 'g-f'}`}>
                        {c.g === 'M' ? '弟兄' : '姊妹'}
                      </span>
                      {c.a && <span className="appt">{c.a}</span>}
                      {isCur && <span className="cur-tag">目前</span>}
                      {isUsed && <span className="used-tag">本週已排</span>}
                    </div>
                    <div className="cand__meta">
                      {c.recent ? (
                        <span className="meta-warn">● {c.d} 天前剛擔任</span>
                      ) : (
                        <span className="meta-strong">{c.d} 天未擔任此項</span>
                      )}
                      <span className="meta-dot">·</span>
                      <span>本季 {c.load} 次</span>
                    </div>
                    <div className="cand__bar">
                      <i style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <span className="cand__rank">{rec ? '★ 推薦' : `#${i + 1}`}</span>
                </button>
              );
            })
          )}
        </div>

        <div className="sheet__manual">
          <input
            placeholder="手動輸入其他姓名（如外地講者）…"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) { pick(manual.trim()); setManual(''); } }}
          />
          <button
            className="btn btn--primary"
            onClick={() => { if (manual.trim()) { pick(manual.trim()); setManual(''); } }}
          >
            指派
          </button>
        </div>

        <div className="sheet__foot">
          符合資格 {total} 人 · {excluded} 人因資格／性別不列入
        </div>
      </div>
    </div>
  );
}
