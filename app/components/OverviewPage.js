'use client';
import { useState, useRef, useEffect } from 'react';
import { getToken } from '../lib/auth-context';

function formatChangeTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ChangesPanel() {
  const [entries, setEntries] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/changelog', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '無法載入變更記錄');
      setEntries(data.entries);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="cl-wrap">
      <div className="cl-head">
        <span className="cl-head__title">最近的指派變更</span>
        <button className="ov-reset-btn" onClick={load} disabled={loading}>
          {loading ? '載入中…' : '↻ 重新整理'}
        </button>
      </div>

      {error && <div className="imp-error">{error}</div>}

      {!error && entries && entries.length === 0 && (
        <div className="people-empty">目前還沒有任何指派變更記錄。</div>
      )}

      {entries && entries.length > 0 && (
        <div className="cl-list">
          {entries.map((e) => (
            <div key={e.id} className={`cl-row cl-row--${e.action}`}>
              <span className="cl-time">{formatChangeTime(e.createdAt)}</span>
              <span className="cl-body">
                {e.action === 'clear' ? (
                  <>
                    <b className="cl-tag cl-tag--clear">清除</b>
                    <span className="cl-where">{e.date}　{e.label}</span>
                    {e.prevName && <small className="cl-prev">（原：{e.prevName}）</small>}
                  </>
                ) : (
                  <>
                    <b className="cl-name">{e.name}</b>
                    <span className="cl-arrow">→</span>
                    <span className="cl-where">{e.date}　{e.label}</span>
                    {e.action === 'reassign' && e.prevName && (
                      <small className="cl-prev">（原：{e.prevName}）</small>
                    )}
                  </>
                )}
              </span>
              {e.actorName && <span className="cl-actor">{e.actorName}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TYPE_BADGE = {
  mw: <span className="ov-type ov-type--mw">聚會</span>,
  we: <span className="ov-type ov-type--we">週末</span>,
  event: <span className="ov-type ov-type--ev">特別</span>,
};

const STAT_BADGE = {
  ok:        <span className="ov-stat ov-stat--ok">已完成</span>,
  gap:       (r) => <span className="ov-stat ov-stat--gap">{r.gaps} 空缺</span>,
  empty:     <span className="ov-stat ov-stat--empty">未排定</span>,
  suspended: <span className="ov-stat ov-stat--susp">暫停</span>,
};

const FILTERS = ['all', 'mw', 'we', 'gap'];
const FILTER_LABELS = { all: '全部', mw: '聚會', we: '週末', gap: '有空缺' };
const SORTS = ['upcoming', 'urgent', 'oldest'];
const SORT_LABELS = { upcoming: '最近優先', urgent: '最緊迫', oldest: '最早優先' };
const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

function parseRowDate(dateStr) {
  const text = String(dateStr ?? '');
  const m = text.match(/(\d+)月\s*(\d+)日/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const now = new Date();
  let year = now.getFullYear();
  if (month === 12 && now.getMonth() <= 1) year--;
  if (month <= 2 && now.getMonth() >= 10) year++;
  return new Date(year, month - 1, day);
}

function compactDate(date) {
  const text = String(date ?? '');
  const monthDay = text.match(/(\d+)月\s*(\d+)日/);
  if (monthDay) return `${monthDay[1]}/${monthDay[2]}`;
  return text;
}

function weekdayFor(date) {
  const text = String(date ?? '');
  const monthDay = text.match(/(\d+)月\s*(\d+)日/);
  if (!monthDay) return '';
  const parsed = new Date(new Date().getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]));
  return WEEKDAY[parsed.getDay()];
}

function missingCount(values) {
  return values.filter((value) => !String(value ?? '').trim()).length;
}

function partGapCount(part) {
  const assigned = (part.assign ?? []).filter(Boolean).length;
  const expected = String(part.roleLabel ?? '').includes('/') ? 2 : 1;
  return Math.max(expected - assigned, 0);
}

function buildOverviewRows(midweekWeeks, weekendRows) {
  const midweekRows = midweekWeeks.map((week) => {
    const cbs = week.living?.find((part) => part.cat === 'cbs');
    const reading = [...(week.treasures ?? []), ...(week.ministry ?? []), ...(week.living ?? [])]
      .find((part) => part.cat === 'reading');
    const roleGaps = missingCount([week.chairman, week.openPrayer, week.closePrayer]);
    const partGaps = [...(week.treasures ?? []), ...(week.ministry ?? []), ...(week.living ?? [])]
      .reduce((sum, part) => sum + partGapCount(part), 0);
    const gaps = roleGaps + partGaps;

    const keys = [
      `主席 ${week.chairman || '未指派'}`,
      cbs ? `研經班 ${(cbs.assign ?? []).filter(Boolean).join(' / ') || '未指派'}` : null,
      reading ? `經文朗讀 ${(reading.assign ?? []).filter(Boolean).join(' / ') || '未指派'}` : null,
    ].filter(Boolean);

    return {
      id: `mw_${week.id ?? week.date}`,
      rawDate: parseRowDate(week.date),
      date: compactDate(week.date),
      wd: weekdayFor(week.date),
      type: 'mw',
      title: week.reading || week.dateLabel || '平日聚會',
      keys,
      status: gaps > 0 ? 'gap' : 'ok',
      gaps,
    };
  });

  const weekendOverviewRows = weekendRows.map((row) => {
    if (row.type === 'event') {
      return {
        id: `we_${row._id ?? row.id}`,
        rawDate: parseRowDate(row.date),
        date: row.date,
        wd: '',
        type: 'event',
        title: [row.label, row.note].filter(Boolean).join(' — ') || '特別事項',
        keys: [],
        status: 'suspended',
        gaps: 0,
      };
    }

    const gaps = missingCount([row.speaker, row.chair, row.wt, row.read]);
    return {
      id: `we_${row._id ?? row.id}`,
      rawDate: parseRowDate(row.date),
      date: row.date,
      wd: '',
      type: 'we',
      title: row.topic || '公眾演講安排',
      keys: [
        `講者 ${row.speaker || '未指派'}${row.cong ? ` · ${row.cong}` : ''}`,
        `主席 ${row.chair || '未指派'}`,
        `守望台 ${row.wt || '未指派'}`,
      ],
      status: gaps > 0 ? 'gap' : 'ok',
      gaps,
    };
  });

  return [...midweekRows, ...weekendOverviewRows];
}

function sortRows(rows, sort) {
  return [...rows].sort((a, b) => {
    if (sort === 'urgent') {
      const gapDiff = (b.gaps || 0) - (a.gaps || 0);
      if (gapDiff !== 0) return gapDiff;
    }
    const da = a.rawDate?.getTime() ?? 0;
    const db = b.rawDate?.getTime() ?? 0;
    return sort === 'oldest' ? db - da : da - db;
  });
}

function SwipeRow({ onDismiss, children }) {
  const startX = useRef(null);
  const [offset, setOffset] = useState(0);
  const isSwiping = useRef(false);

  function onTouchStart(e) {
    startX.current = e.touches[0].clientX;
    isSwiping.current = false;
  }

  function onTouchMove(e) {
    if (startX.current === null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < -8) {
      isSwiping.current = true;
      setOffset(Math.min(0, dx));
    }
  }

  function onTouchEnd() {
    if (offset < -80) {
      onDismiss();
    } else {
      setOffset(0);
    }
    startX.current = null;
    isSwiping.current = false;
  }

  const opacity = offset < -40 ? Math.max(0.2, 1 - (-offset - 40) / 100) : 1;

  return (
    <div
      className="ov-swipe-wrap"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{
        transform: `translateX(${offset}px)`,
        transition: offset === 0 ? 'transform 0.22s ease' : 'none',
        opacity,
      }}
    >
      {children}
    </div>
  );
}

function OvToast({ toast, onHide }) {
  const timer = useRef(null);

  useEffect(() => {
    if (!toast) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(onHide, 4000);
    return () => clearTimeout(timer.current);
  }, [toast, onHide]);

  if (!toast) return null;
  return (
    <div className="ov-toast show">
      <span>{toast.msg}</span>
      {toast.undo && (
        <button className="toast__undo" onClick={() => { toast.undo(); onHide(); }}>
          復原
        </button>
      )}
    </div>
  );
}

export default function OverviewPage({ midweekWeeks = [], weekendRows = [], loading = false }) {
  const [tab, setTab] = useState('schedule'); // 'schedule' | 'changes'
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('upcoming');
  const [showPast, setShowPast] = useState(false);
  const [dismissed, setDismissed] = useState([]);
  const [toast, setToast] = useState(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const allRows = buildOverviewRows(midweekWeeks, weekendRows);

  function dismiss(id) {
    setDismissed((prev) => [...prev, id]);
    setToast({
      msg: '已隱藏項目',
      undo: () => setDismissed((prev) => prev.filter((x) => x !== id)),
    });
  }

  function resetDismissed() {
    const count = dismissed.length;
    const snapshot = [...dismissed];
    setDismissed([]);
    setToast({
      msg: `已還原 ${count} 個隱藏項目`,
      undo: () => setDismissed(snapshot),
    });
  }

  const visibleRows = allRows.filter((r) => {
    if (dismissed.includes(r.id)) return false;
    if (filter === 'gap') return r.status === 'gap' || r.status === 'empty';
    if (filter !== 'all') return r.type === filter;
    return true;
  });

  const futureRows = sortRows(
    visibleRows.filter((r) => !r.rawDate || r.rawDate >= today),
    sort,
  );
  const pastRows = sortRows(
    visibleRows.filter((r) => r.rawDate && r.rawDate < today),
    'oldest',
  );

  const hiddenPastCount = allRows.filter(
    (r) => r.rawDate && r.rawDate < today && !dismissed.includes(r.id) &&
      (() => {
        if (filter === 'gap') return r.status === 'gap' || r.status === 'empty';
        if (filter !== 'all') return r.type === filter;
        return true;
      })(),
  ).length;

  return (
    <section className="ov-section">
      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button className="tab" role="tab"
            aria-selected={tab === 'schedule' ? 'true' : 'false'}
            onClick={() => setTab('schedule')}>安排</button>
          <button className="tab" role="tab"
            aria-selected={tab === 'changes' ? 'true' : 'false'}
            onClick={() => setTab('changes')}>最近變更</button>
        </div>
        <div className="toolbar__spacer" />
        {tab === 'schedule' && (
          <div className="chips" role="group">
            {FILTERS.map((f) => (
              <button
                key={f}
                className={`chip${f === 'gap' ? ' chip--alert' : ''}`}
                aria-pressed={filter === f ? 'true' : 'false'}
                onClick={() => setFilter(f)}
              >
                {FILTER_LABELS[f]}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'changes' && <ChangesPanel />}

      {tab === 'schedule' && (
      <>
      <div className="ov-controls">
        <div className="ov-sort-group">
          {SORTS.map((s) => (
            <button
              key={s}
              className={`ov-sort-btn${sort === s ? ' ov-sort-btn--active' : ''}`}
              onClick={() => setSort(s)}
            >
              {SORT_LABELS[s]}
            </button>
          ))}
        </div>
        {dismissed.length > 0 && (
          <button className="ov-reset-btn" onClick={resetDismissed}>
            還原隱藏 ({dismissed.length})
          </button>
        )}
      </div>

      <div className="ov-list">
        {loading && <div className="people-empty">正在載入會眾資料…</div>}

        {!loading && futureRows.length === 0 && pastRows.length === 0 && (
          <div className="people-empty">目前沒有可顯示的聚會或週末安排。</div>
        )}

        {!loading && futureRows.map((r) => (
          <SwipeRow key={r.id} onDismiss={() => dismiss(r.id)}>
            <div className={`ov-row-wrap ov-row--${r.status}`}>
              <button className="ov-row">
                <span className="ov-date">
                  <b>{r.date}</b>
                  <small>週{r.wd}</small>
                </span>
                {TYPE_BADGE[r.type]}
                <span className="ov-main">
                  <span className="ov-title">{r.title}</span>
                  <span className="ov-keys">
                    {r.keys.map((k, j) => (
                      <span key={j} className={`ov-key${/未指派|未排定|尚未/.test(k) ? ' ov-key--miss' : ''}`}>
                        {k}
                      </span>
                    ))}
                  </span>
                </span>
                {r.status === 'gap' ? STAT_BADGE.gap(r) : (STAT_BADGE[r.status] ?? null)}
              </button>
              <button
                className="ov-dismiss-btn"
                aria-label="隱藏"
                onClick={() => dismiss(r.id)}
              >
                ×
              </button>
            </div>
          </SwipeRow>
        ))}

        {!loading && hiddenPastCount > 0 && (
          <button
            className="ov-past-toggle"
            onClick={() => setShowPast((v) => !v)}
          >
            {showPast ? '▲ 隱藏過去的安排' : `▼ 查看過去 ${hiddenPastCount} 項安排`}
          </button>
        )}

        {!loading && showPast && pastRows.map((r) => (
          <SwipeRow key={r.id} onDismiss={() => dismiss(r.id)}>
            <div className={`ov-row-wrap ov-row--${r.status} ov-row--past`}>
              <button className="ov-row">
                <span className="ov-date">
                  <b>{r.date}</b>
                  <small>週{r.wd}</small>
                </span>
                {TYPE_BADGE[r.type]}
                <span className="ov-main">
                  <span className="ov-title">{r.title}</span>
                  <span className="ov-keys">
                    {r.keys.map((k, j) => (
                      <span key={j} className={`ov-key${/未指派|未排定|尚未/.test(k) ? ' ov-key--miss' : ''}`}>
                        {k}
                      </span>
                    ))}
                  </span>
                </span>
                {r.status === 'gap' ? STAT_BADGE.gap(r) : (STAT_BADGE[r.status] ?? null)}
              </button>
              <button
                className="ov-dismiss-btn"
                aria-label="隱藏"
                onClick={() => dismiss(r.id)}
              >
                ×
              </button>
            </div>
          </SwipeRow>
        ))}
      </div>
      </>
      )}

      <OvToast toast={toast} onHide={() => setToast(null)} />
    </section>
  );
}
