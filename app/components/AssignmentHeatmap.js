'use client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  buildHeatmapRows, buildPersonDetail, buildPersonSummary,
  weeksInMonth, windowLabel,
} from '../lib/heatmap.mjs';
import {
  captureBox, triggerDownload, jpegDataUrlToImage, jpegImagesToPdfBlob,
} from '../lib/midweekExport';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return isMobile;
}

// True only for devices that really hover. On a touchscreen a tap fires
// mouseenter AND click, so wiring both made the bubble open and instantly close
// again ("pops up for a millisecond"). Touch gets click-to-toggle only.
function useCanHover() {
  const [canHover, setCanHover] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return canHover;
}

// Width of the element, tracked live — the grid sizes its squares to fit rather
// than using fixed sizes that overflow narrow screens.
function useMeasuredWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

const GENDER_OPTS = [['all', '全部'], ['F', '姊妹'], ['M', '弟兄']];

const RANGE_OPTS = [
  { key: '3', label: '3 個月', mode: 'rolling', range: 3 },
  { key: '6', label: '6 個月', mode: 'rolling', range: 6 },
  { key: '12', label: '12 個月', mode: 'rolling', range: 12 },
  { key: 'sy', label: '本服務年度', mode: 'serviceYear', range: 12 },
];
const rangeOptOf = (key) => RANGE_OPTS.find((o) => o.key === key) ?? RANGE_OPTS[2];

function bubbleTextFor(events) {
  return events.map((e) => `${e.date.getMonth() + 1}月${e.date.getDate()}日　${e.label}`).join('\n');
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────
// The bubble is rendered ONCE, position:fixed, and placed from a measured rect.
// It cannot live inside the cell: every container it would sit in clips it —
// .hm-tablewrap scrolls, and .hm-grid52's overflow-x makes overflow-y compute to
// auto as well — so an absolutely-positioned bubble is cut off on the top row
// and at the left/right edges.

function useBubble() {
  const [bubble, setBubble] = useState(null);
  const open = useCallback((key, text, el) => {
    if (!text || !el) return;
    setBubble({ key, text, rect: el.getBoundingClientRect() });
  }, []);
  const toggle = useCallback((key, text, el) => {
    setBubble((cur) => (cur?.key === key ? null : (text && el ? { key, text, rect: el.getBoundingClientRect() } : null)));
  }, []);
  const close = useCallback(() => setBubble(null), []);

  // A fixed bubble no longer travels with its cell, so any scroll dismisses it —
  // and so does pressing anywhere that isn't a cell (cells are left to the
  // toggle handler, so tapping the same cell twice still closes it).
  useEffect(() => {
    if (!bubble) return;
    const dismiss = () => setBubble(null);
    const onDown = (e) => { if (!e.target?.closest?.('.hm-cellwrap')) setBubble(null); };
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [bubble]);

  return { bubble, open, toggle, close };
}

const BUBBLE_MARGIN = 8;
const BUBBLE_GAP = 7;

function BubbleLayer({ bubble }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !bubble) return;
    // Measure at a neutral position, then place: above by preference, flipped
    // below when there isn't room, and clamped horizontally to the viewport.
    el.style.top = '0px';
    el.style.left = '0px';
    const box = el.getBoundingClientRect();
    const r = bubble.rect;

    let below = false;
    let top = r.top - box.height - BUBBLE_GAP;
    if (top < BUBBLE_MARGIN) {
      top = r.bottom + BUBBLE_GAP;
      below = true;
      if (top + box.height > window.innerHeight - BUBBLE_MARGIN) {
        top = Math.max(BUBBLE_MARGIN, window.innerHeight - BUBBLE_MARGIN - box.height);
      }
    }
    const left = Math.max(
      BUBBLE_MARGIN,
      Math.min(r.left + r.width / 2 - box.width / 2, window.innerWidth - box.width - BUBBLE_MARGIN)
    );

    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.classList.toggle('hm-bubble--below', below);
    el.style.visibility = 'visible';
  }, [bubble]);

  if (!bubble) return null;
  return <div ref={ref} className="hm-bubble" style={{ visibility: 'hidden' }}>{bubble.text}</div>;
}

// One heat square. Cells with no assignments (and months with no data) are
// inert — no bubble, no pointer cursor.
function Cell({ cellKey, n, covered, size, radius, text, canHover, onOpen, onToggle }) {
  const live = covered && n > 0;
  return (
    <div
      className="hm-cellwrap"
      style={{ cursor: live ? 'pointer' : 'default' }}
      onMouseEnter={live && canHover ? (e) => onOpen(cellKey, text, e.currentTarget) : undefined}
      onClick={live ? (e) => onToggle(cellKey, text, e.currentTarget) : undefined}
    >
      <div
        className={`hm-cell ${covered ? `hm-cell--${Math.min(n, 3)}` : 'hm-cell--nodata'}`}
        style={{ width: size, height: size, borderRadius: radius }}
      />
    </div>
  );
}

// ─── Overview grid ────────────────────────────────────────────────────────────

function OverviewGrid({ people, midweekWeeks, weekendRows, getAssign, view, setView, onOpenPerson }) {
  const isMobile = useIsMobile();
  const { bubble, open, toggle, close } = useBubble();
  const canHover = useCanHover();
  const [wrapRef, wrapWidth] = useMeasuredWidth();
  const nowColRef = useRef(null);

  const { gender, rangeKey, offset } = view;
  const opt = rangeOptOf(rangeKey);
  const today = useMemo(() => new Date(), []);

  const data = useMemo(
    () => buildHeatmapRows(people, midweekWeeks, {}, weekendRows, {
      gender, mode: opt.mode, range: opt.range, offset, getAssign,
    }),
    [people, midweekWeeks, weekendRows, getAssign, gender, opt.mode, opt.range, offset]
  );
  const { rows, win, monthMode, coveredCount } = data;

  // Names are never truncated — the column is sized to the longest one actually
  // present. If that pushes the grid past the viewport the table scrolls
  // sideways (the name and count columns are sticky), which is preferred to
  // eliding someone's name to "陳..".
  const nameFont = isMobile ? 13 : 14;
  const nameW = useMemo(() => {
    const longest = rows.reduce((n, r) => Math.max(n, [...String(r.person.name ?? '')].length), 2);
    const chrome = 14 + 18 + 7 + 10; // padding-left + badge + gap + padding-right
    return Math.min(220, Math.max(isMobile ? 84 : 150, chrome + longest * nameFont));
  }, [rows, isMobile, nameFont]);
  const countW = isMobile ? 44 : 56;
  const attnW = isMobile ? 0 : 150;
  const gap = monthMode ? 4 : 3;
  const pad = monthMode ? 2 : 5;

  // Fit the squares to the width we actually have instead of hardcoding a size:
  // 12 fixed 20px months need 288px but a phone only has ~204px, which is what
  // made 整年 scroll and hid the current month off the right edge.
  const cellCount = monthMode
    ? win.length
    : win.reduce((sum, m) => sum + weeksInMonth(m.year, m.month), 0);
  const avail = Math.max(0, wrapWidth - nameW - countW - attnW);
  const rawSize = cellCount
    ? (avail - gap * (cellCount - win.length) - 2 * pad * win.length) / cellCount
    : 0;
  // Floor the square at the width its column label needs, otherwise "10月"
  // wraps to two lines and spills out of the header.
  const minCell = monthMode ? (isMobile ? 18 : 22) : 9;
  const maxCell = monthMode ? (isMobile ? 26 : 30) : (isMobile ? 20 : 26);
  const size = wrapWidth
    ? Math.max(minCell, Math.min(maxCell, Math.floor(rawSize)))
    : (monthMode ? 20 : 14);
  const radius = monthMode ? 4 : 3;
  const rowH = isMobile ? 34 : 42;

  const setRange = (key) => setView((v) => ({ ...v, rangeKey: key, offset: 0 }));
  const setGender = (g) => setView((v) => ({ ...v, gender: g }));
  const goPrev = () => setView((v) => ({ ...v, offset: v.offset + 1 }));
  const goNext = () => setView((v) => ({ ...v, offset: Math.max(0, v.offset - 1) }));

  // When the table is wider than the screen, open on the current month rather
  // than on the left-hand edge of the window.
  useEffect(() => {
    const el = nowColRef.current;
    const wrap = wrapRef.current;
    if (!el || !wrap || wrap.scrollWidth <= wrap.clientWidth + 1) return;
    el.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [win, size, wrapWidth, wrapRef]);

  const attnCount = rows.filter((r) => r.rank > 0).length;
  const noteText = `${monthMode ? '一格一個月' : '一格一週'}，${canHover ? '移到格子上' : '點一下'}看內容`;

  function bandStyle(mi) {
    return {
      display: 'flex', alignItems: 'center', gap, flex: 'none',
      padding: `0 ${pad}px`, height: rowH,
      background: monthMode ? 'transparent' : (mi % 2 ? 'var(--hm-band-tint)' : 'transparent'),
    };
  }

  function monthHeaderStyle(m) {
    const cells = monthMode ? 1 : weeksInMonth(m.year, m.month);
    return { flex: 'none', width: cells * (size + gap) - gap + pad * 2, textAlign: 'center' };
  }

  return (
    <div className="hm-root">
      <div className="hm-header">
        <div>
          <div className="hm-title">指派分布</div>
          <div className="hm-subhead">
            {windowLabel(win, opt.mode)} · {rows.length} 位 · {noteText}
            {coveredCount < win.length && `　·　${win.length - coveredCount} 個月尚無聚會資料`}
            {attnCount > 0 ? `　·　需要注意的 ${attnCount} 位排在最前面` : '　·　目前沒有需要注意的人'}
          </div>
        </div>
        <div className="hm-filters">
          <div className="hm-seg">
            {GENDER_OPTS.map(([v, label]) => (
              <button key={v} className={`hm-seg__btn${gender === v ? ' is-on' : ''}`} onClick={() => setGender(v)}>{label}</button>
            ))}
          </div>
          <div className="hm-seg">
            {RANGE_OPTS.map((o) => (
              <button key={o.key} className={`hm-seg__btn${rangeKey === o.key ? ' is-on' : ''}`} onClick={() => setRange(o.key)}>{o.label}</button>
            ))}
          </div>
          <div className="hm-arrows">
            <button className="hm-arrow" onClick={goPrev} aria-label="上一段期間">‹</button>
            <button className="hm-arrow" disabled={offset <= 0} onClick={goNext} aria-label="下一段期間">›</button>
          </div>
        </div>
      </div>

      <div className="hm-tablewrap" ref={wrapRef} onMouseLeave={canHover ? close : undefined}>
        <div className="hm-colhead" style={{ height: isMobile ? 30 : 34 }}>
          <div className="hm-colhead__name" style={{ width: nameW }}>姓名</div>
          {win.map((m) => {
            const isNow = m.month === today.getMonth() + 1 && m.year === today.getFullYear();
            return (
              <div key={`${m.year}-${m.month}`} ref={isNow ? nowColRef : undefined} style={monthHeaderStyle(m)}>
                <span className={`hm-colhead__month${isNow ? ' hm-colhead__month--now' : ''}`}>
                  {isMobile ? m.month : `${m.month}月`}
                </span>
              </div>
            );
          })}
          {!isMobile && <div className="hm-colhead__attn" style={{ width: attnW }}>需要注意</div>}
          <div className="hm-colhead__count" style={{ width: countW }}>件數</div>
        </div>

        <div className="hm-body">
          {rows.length === 0 && <div className="people-empty">目前沒有符合條件的成員。</div>}
          {rows.map((r, ri) => {
            const lastAttn = r.rank > 0 && (!rows[ri + 1] || rows[ri + 1].rank === 0);
            const flagged = r.dbl > 0;
            const note = r.dbl ? `同月 ${r.dbl} 次重複` : r.idle ? `${r.idle} 個月未派` : '';
            const showMobileNote = isMobile && r.rank > 0;
            return (
              <div
                key={r.person.id ?? r.person.name}
                className={`hm-row${lastAttn ? ' hm-row--lastAttn' : ''}`}
                style={{ height: showMobileNote ? rowH + 16 : rowH }}
              >
                <button
                  className={`hm-name${showMobileNote ? ' hm-name--stack' : ''}`}
                  style={{ width: nameW }}
                  onClick={() => onOpenPerson(r.person)}
                >
                  <span className="hm-name__row">
                    <span className={`hm-badge hm-badge--${r.person.g === 'F' ? 'f' : 'm'}`}>{r.person.g === 'F' ? '姊' : '兄'}</span>
                    <span className="hm-name__text">{r.person.name}</span>
                  </span>
                  {showMobileNote && <span className={`hm-chip hm-chip--sm${flagged ? ' hm-chip--warn' : ''}`}>{note}</span>}
                </button>

                {r.monthly.map((m, mi) => (
                  <div key={m.key} style={bandStyle(mi)}>
                    {monthMode ? (
                      <Cell
                        cellKey={`${r.person.name}-m-${m.key}`}
                        n={m.n} covered={m.covered} size={size} radius={radius}
                        text={bubbleTextFor(m.events)}
                        canHover={canHover} onOpen={open} onToggle={toggle}
                      />
                    ) : (
                      m.weeks.map((wEvts, wi) => (
                        <Cell
                          key={wi}
                          cellKey={`${r.person.name}-w-${m.key}-${wi}`}
                          n={wEvts.length} covered={m.covered} size={size} radius={radius}
                          text={bubbleTextFor(wEvts)}
                          canHover={canHover} onOpen={open} onToggle={toggle}
                        />
                      ))
                    )}
                  </div>
                ))}

                {!isMobile && (
                  <div className="hm-attn" style={{ width: attnW }}>
                    {r.rank > 0 && <span className={`hm-chip${flagged ? ' hm-chip--warn' : ''}`}>{note}</span>}
                  </div>
                )}
                <div className="hm-count" style={{ width: countW, color: flagged ? 'var(--special)' : 'var(--ink-3)' }}>{r.total}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="hm-legend">
        <div className="hm-legend__ramp">
          <span className="hm-legend__lbl">件數</span>
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="hm-legend__swatch-wrap">
              <div className={`hm-swatch hm-swatch--${n}`} />
              <span className="hm-legend__n">{n === 3 ? '3+' : n}</span>
            </div>
          ))}
          <div className="hm-legend__swatch-wrap hm-legend__swatch-wrap--nodata">
            <div className="hm-swatch hm-swatch--nodata" />
            <span className="hm-legend__n">無</span>
          </div>
        </div>
        <div className="hm-legend__note">
          粗線以上為需要注意的人：同月兩份以上，或該期間內長期沒有指派。「無」表示該月份還沒有匯入聚會，不計入未派。
        </div>
      </div>

      <BubbleLayer bubble={bubble} />
    </div>
  );
}

// A dropdown positioned against the viewport rather than its parent. The card
// it lives in is a rounded, scrolling container, so an absolutely-positioned
// menu gets clipped; and right-aligning it made it open leftwards off the edge
// on narrow screens. This opens RIGHTWARDS from the button and is clamped so it
// can never leave the viewport, whatever the surrounding layout does.
function AnchoredMenu({ anchorRef, children }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    el.style.top = '0px';
    el.style.left = '0px';
    const box = el.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const M = 8;

    let top = a.bottom + M;
    if (top + box.height > window.innerHeight - M) {
      const above = a.top - box.height - M;
      top = above >= M ? above : Math.max(M, window.innerHeight - M - box.height);
    }
    const left = Math.max(M, Math.min(a.left, window.innerWidth - box.width - M));

    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.visibility = 'visible';
  }, [anchorRef, children]);

  return (
    <div ref={ref} className="menu menu--anchored" style={{ visibility: 'hidden' }} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>
  );
}

const PERSON_EXPORT_ITEMS = [
  { ic: '▦', label: '匯出 JPG', sub: '貼到 LINE 群組', action: 'jpg' },
  { ic: '▭', label: '複製圖片到剪貼簿', action: 'copy' },
  { ic: '✎', label: '複製文字', sub: '手動貼到 LINE 群組', action: 'text' },
  null,
  { ic: '▥', label: '下載 PDF', sub: '直接下載檔案', action: 'pdf' },
];

// Same export set as the meetings page, sharing its helpers. The card is
// captured as it renders, so the inner scroll areas are unpinned for the
// duration of the shot (`is-capturing`) — otherwise html-to-image would
// photograph only the currently-scrolled slice of 指派記錄.
function PersonExportMenu({ cardRef, personName, periodLabel, buildText }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  const filename = (ext) => `${personName}-指派分布-${periodLabel}.${ext}`.replace(/\s+/g, '');

  async function withCapture(fn) {
    const node = cardRef.current;
    if (!node) return;
    node.classList.add('is-capturing');
    // Let layout settle before measuring/capturing the unpinned card.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      return await fn(node, { pixelRatio: 2, skipFonts: false, ...captureBox(node) });
    } finally {
      node.classList.remove('is-capturing');
    }
  }

  const handleExport = async (type) => {
    setOpen(false);
    try {
      if (type === 'text') {
        const text = buildText();
        if (!navigator.clipboard?.writeText) throw new Error('目前瀏覽器不支援複製文字。');
        await navigator.clipboard.writeText(text);
        window.alert('已複製指派記錄文字，可貼到 LINE。');
        return;
      }
      if (type === 'jpg') {
        await withCapture(async (node, opts) => {
          const { toJpeg } = await import('html-to-image');
          const dataUrl = await toJpeg(node, { ...opts, quality: 0.95, backgroundColor: '#ffffff' });
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = filename('jpg');
          a.click();
        });
      } else if (type === 'copy') {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
          throw new Error('目前瀏覽器不支援圖片剪貼簿。');
        }
        await withCapture(async (node, opts) => {
          const { toPng } = await import('html-to-image');
          const dataUrl = await toPng(node, { ...opts, backgroundColor: '#ffffff' });
          const blob = await (await fetch(dataUrl)).blob();
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        });
      } else if (type === 'pdf') {
        await withCapture(async (node, opts) => {
          const { toJpeg } = await import('html-to-image');
          const dataUrl = await toJpeg(node, { ...opts, quality: 0.95, backgroundColor: '#ffffff' });
          const image = await jpegDataUrlToImage(dataUrl);
          triggerDownload(jpegImagesToPdfBlob([image]), filename('pdf'));
        });
      }
    } catch (error) {
      window.alert(error?.message || '匯出失敗');
    }
  };

  return (
    <div className="menuwrap" ref={wrapRef}>
      <button ref={btnRef} className="btn btn--primary" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        匯出 <span className="caret">▾</span>
      </button>
      {open && (
        <AnchoredMenu anchorRef={btnRef}>
          {PERSON_EXPORT_ITEMS.map((item, i) => item === null ? (
            <div key={i} className="menu__div" />
          ) : (
            <button key={i} type="button" className="menu__item" onClick={() => handleExport(item.action)}>
              <span className="menu__ic">{item.ic}</span>
              {item.label}
              {item.sub && <small>{item.sub}</small>}
            </button>
          ))}
        </AnchoredMenu>
      )}
    </div>
  );
}

// ─── Person detail ────────────────────────────────────────────────────────────

function PersonDetail({ person, midweekWeeks, weekendRows, getAssign, view, onBack }) {
  const isMobile = useIsMobile();
  const { bubble, open, toggle, close } = useBubble();
  const canHover = useCanHover();
  const cardRef = useRef(null);
  const opt = rangeOptOf(view.rangeKey);

  const detail = useMemo(
    () => buildPersonDetail(person.name, person.g, midweekWeeks, {}, weekendRows, {
      mode: opt.mode, range: opt.range, offset: view.offset, getAssign,
    }),
    [person, midweekWeeks, weekendRows, getAssign, opt.mode, opt.range, view.offset]
  );
  const summary = useMemo(() => buildPersonSummary(person.name, person.g, detail), [person, detail]);

  const genderLabel = person.g === 'F' ? '姊妹' : '弟兄';
  const periodLabel = windowLabel(detail.win, opt.mode);
  const size = isMobile ? 11 : 20;
  const bandGap = isMobile ? 3 : 4;

  function buildText() {
    return [
      `${person.name}（${genderLabel}）`,
      periodLabel,
      '',
      summary,
      '',
      '指派記錄：',
      // Full dates here — no width constraint in text, and M/D alone is
      // ambiguous once the window crosses a year boundary.
      ...detail.records.map((r) => {
        const d = r.rawDate;
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}　${r.label}${r.partner ? `　（${r.partner}）` : ''}`;
      }),
    ].join('\n');
  }

  const stats = [
    { label: '期間件數', value: `${detail.total} 份` },
    { label: '平均間隔', value: detail.avgGapWeeks != null ? `${detail.avgGapWeeks.toFixed(1)} 週` : '—' },
    { label: '最長間隔', value: detail.maxGapWeeks != null ? `${Math.round(detail.maxGapWeeks)} 週` : '—' },
    { label: '同月重複', value: detail.doubleMonths.length ? `${detail.doubleMonths.length} 次（${detail.doubleMonths.map((m) => `${m.month}月`).join('、')}）` : '無' },
  ];

  return (
    <div className="hm-person" ref={cardRef}>
      <div className="hm-person__head">
        <div>
          <button className="hm-back" onClick={onBack}>‹ 總覽</button>
          <div className="hm-person__title">
            <span className="hm-person__name">{person.name}</span>
            <span className="hm-person__meta">{genderLabel}{person.appt ? ` · ${person.appt}` : ''} · {periodLabel}</span>
          </div>
        </div>
        <div className="hm-person__actions hm-noexport">
          <PersonExportMenu
            cardRef={cardRef}
            personName={person.name}
            periodLabel={periodLabel}
            buildText={buildText}
          />
        </div>
      </div>

      <div className="hm-person__body">
        <div className="hm-person__left">
          <p className="hm-person__summary">{summary}</p>

          <div>
            <div className="hm-person__lbl">
              {detail.win.length} 個月 · 一格一週，{canHover ? '移到格子上' : '點一下'}看內容
            </div>
            <div className="hm-grid52-scroll" onMouseLeave={canHover ? close : undefined}>
            <div className="hm-grid52">
              {detail.monthly.map((m) => (
                <div key={m.key} className="hm-grid52__band" style={{ gap: bandGap }}>
                  {m.weeks.map((wEvts, wi) => {
                    const dbl = wEvts.length >= 2;
                    const live = m.covered && wEvts.length > 0;
                    const key = `p-${m.key}-${wi}`;
                    const text = bubbleTextFor(wEvts);
                    return (
                      <div
                        key={wi}
                        className="hm-cellwrap"
                        style={{ cursor: live ? 'pointer' : 'default' }}
                        onMouseEnter={live && canHover ? (e) => open(key, text, e.currentTarget) : undefined}
                        onClick={live ? (e) => toggle(key, text, e.currentTarget) : undefined}
                      >
                        <div
                          className={`hm-cell ${!m.covered ? 'hm-cell--nodata' : dbl ? 'hm-cell--warn' : `hm-cell--${Math.min(wEvts.length, 3)}`}`}
                          style={{ width: size, height: size, borderRadius: isMobile ? 3 : 5 }}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <div className="hm-grid52__months">
              {detail.monthly.map((m) => (
                <span
                  key={m.key}
                  className="hm-grid52__mlbl"
                  style={{ width: m.weeks.length * (size + bandGap) - bandGap }}
                >{m.month}</span>
              ))}
            </div>
            </div>
          </div>

          <div>
            <div className="hm-person__lbl">每月件數 · 褐色為同月兩份以上</div>
            <div className="hm-bars">
              {detail.monthly.map((m) => (
                <div key={m.key} className="hm-bars__col">
                  <span className="hm-bars__n">{m.covered ? m.n : '–'}</span>
                  <div
                    className={`hm-bars__bar ${m.flagN >= 2 ? 'is-warn' : !m.covered ? 'hm-cell--nodata' : `hm-cell--${Math.min(m.n, 3)}`}`}
                    style={{ height: Math.max(18, 18 + m.n * 16) }}
                  />
                  <span className="hm-bars__lbl">{m.month}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="hm-recwrap">
            <div className="hm-person__lbl hm-recwrap__head">
              <span>指派記錄</span>
              <span className="hm-recwrap__count">共 {detail.total} 份</span>
            </div>
            <div className="hm-reclist">
              {detail.records.length === 0 && <div className="people-empty">這段期間沒有指派記錄。</div>}
              {detail.records.map((r, i) => (
                <div key={i}>
                  {(i === 0 || detail.records[i - 1].year !== r.year) && (
                    <div className="hm-rec__year">{r.year} 年</div>
                  )}
                  <div className={`hm-rec${r.flagged ? ' hm-rec--flag' : ''}`}>
                    <span className={`hm-rec__date${r.flagged ? ' is-warn' : ''}`}>{r.date}</span>
                    <span className="hm-rec__label">{r.label}</span>
                    <span className="hm-rec__partner">{r.partner ?? '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="hm-person__right">
          <div>
            <div className="hm-person__lbl">概況</div>
            {stats.map((s) => (
              <div key={s.label} className="hm-stat">
                <span className="hm-stat__lbl">{s.label}</span>
                <span className="hm-stat__val">{s.value}</span>
              </div>
            ))}
          </div>

          {detail.pairings.length > 0 && (
            <div>
              <div className="hm-person__lbl">助手搭配</div>
              <div className="hm-pairings">
                {detail.pairings.map((p) => (
                  <div key={p.name} className="hm-pairing">
                    <span className="hm-pairing__name">{p.name}</span>
                    <div className="hm-pairing__track">
                      <div className="hm-pairing__fill" style={{ width: `${(p.n / detail.pairings[0].n) * 100}%` }} />
                    </div>
                    <span className="hm-pairing__n">{p.n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {detail.doubleMonths.length > 0 && (
            <div className="hm-callout">
              {`${detail.doubleMonths.map((m) => `${m.month}月`).join('、')}有兩份以上指派，超出同一個月一份的原則。其餘月份都在範圍內。`}
            </div>
          )}
        </div>
      </div>

      <BubbleLayer bubble={bubble} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AssignmentHeatmap({ people = [], midweekWeeks = [], weekendRows = [], getAssign }) {
  const [selected, setSelected] = useState(null);
  // Shared by both views so the person detail always shows the same period the
  // grid was showing when the row was tapped.
  const [view, setView] = useState({ gender: 'all', rangeKey: '12', offset: 0 });

  if (selected) {
    return (
      <PersonDetail
        person={selected}
        midweekWeeks={midweekWeeks}
        weekendRows={weekendRows}
        getAssign={getAssign}
        view={view}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <OverviewGrid
      people={people}
      midweekWeeks={midweekWeeks}
      weekendRows={weekendRows}
      getAssign={getAssign}
      view={view}
      setView={setView}
      onOpenPerson={setSelected}
    />
  );
}
