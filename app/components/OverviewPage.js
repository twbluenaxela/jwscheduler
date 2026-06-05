'use client';
import { useState, useRef, useEffect } from 'react';
import { getToken } from '../lib/auth-context';

// ─── ChangesPanel ────────────────────────────────────────────────────────────

function formatChangeTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ChangesPanel() {
  const [entries, setEntries] = useState(null);
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

  const handleCopyText = async () => {
    if (!entries || entries.length === 0) return;
    const textToCopy = entries.map((e) => {
      const time = formatChangeTime(e.createdAt);
      const actionText = e.action === 'clear'
        ? `[清除] ${e.date} ${e.label} ${e.prevName ? `(原:${e.prevName})` : ''}`
        : `${e.name} → ${e.date} ${e.label} ${e.prevName ? `(原:${e.prevName})` : ''}`;
      return `${time} | ${actionText}`;
    }).join('\n');
    try {
      await navigator.clipboard.writeText(textToCopy);
      alert('已複製到剪貼簿！');
    } catch {
      alert('複製失敗，請手動複製。');
    }
  };

  const handleClearLogs = async () => {
    if (!confirm('確定要清除所有變更紀錄嗎？此操作無法復原。')) return;
    const snapshot = entries;
    setEntries([]);
    try {
      const token = await getToken();
      const res = await fetch('/api/changelog', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '清除失敗');
      }
    } catch (err) {
      setEntries(snapshot);
      alert(err.message || '清除失敗，請稍後再試。');
    }
  };

  return (
    <div className="cl-wrap">
      <div className="cl-head">
        <span className="cl-head__title">最近的指派變更</span>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {entries && entries.length > 0 && (
            <>
              <button className="ov-reset-btn" onClick={handleCopyText} disabled={loading}>
                複製文字
              </button>
              <button
                className="ov-reset-btn"
                onClick={handleClearLogs}
                disabled={loading}
                style={{ color: '#d32f2f', borderColor: '#ffcdd2', backgroundColor: '#ffebee' }}
              >
                清除
              </button>
            </>
          )}
          <button className="ov-reset-btn" onClick={load} disabled={loading}>
            {loading ? '載入中…' : '↻ 重新整理'}
          </button>
        </div>
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

// ─── Data helpers ─────────────────────────────────────────────────────────────

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

function parseRowDate(dateStr) {
  const text = String(dateStr ?? '');
  // Chinese: "6月 3日" or slash "8/9"
  const cn = text.match(/(\d+)月\s*(\d+)日/);
  if (cn) {
    const month = Number(cn[1]);
    const day = Number(cn[2]);
    const now = new Date();
    let year = now.getFullYear();
    if (month === 12 && now.getMonth() <= 1) year--;
    if (month <= 2 && now.getMonth() >= 10) year++;
    return new Date(year, month - 1, day);
  }
  const slash = text.match(/^(\d+)\/(\d+)$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const now = new Date();
    let year = now.getFullYear();
    if (month === 12 && now.getMonth() <= 1) year--;
    if (month <= 2 && now.getMonth() >= 10) year++;
    return new Date(year, month - 1, day);
  }
  return null;
}

function compactDate(date) {
  const text = String(date ?? '');
  const cn = text.match(/(\d+)月\s*(\d+)日/);
  if (cn) return `${cn[1]}/${cn[2]}`;
  const slash = text.match(/^(\d+)\/(\d+)$/);
  if (slash) return text;
  return text;
}

function weekdayFor(rawDate) {
  if (!rawDate) return '';
  return WEEKDAY[rawDate.getDay()];
}

function partGapCount(part) {
  const assigned = (part.assign ?? []).filter(Boolean).length;
  // If the helper slot was intentionally removed, only the primary slot counts
  const isPair = String(part.roleLabel ?? '').includes('/') && !part.hideHelper;
  const expected = isPair ? 2 : 1;
  return Math.max(expected - assigned, 0);
}

function buildOverviewRows(midweekWeeks, weekendRows, getAssign = (_, d) => d ?? '') {
  const midweekItems = midweekWeeks.map((week, weekIdx) => {
    const rawDate = parseRowDate(week.date);
    const weekType = week.type ?? 'normal';
    const weekLabel = week.label ?? '';

    // Resolve a slot through the live assignments map, falling back to the
    // value baked into the week object at load time.
    const ga = (key, fallback = '') => getAssign(`mw${week.id}_${key}`, fallback);

    // Assembly weeks: no gap counting, shown as a suspended event row
    if (weekType === 'assembly') {
      return {
        id: `mw_${week.id ?? week.date}`,
        rawDate,
        date: compactDate(week.date),
        wd: weekdayFor(rawDate),
        type: 'event',
        title: weekLabel || '大會週',
        keys: [],
        status: 'suspended',
        gaps: 0,
        weekIdx,
      };
    }

    const allParts = [...(week.treasures ?? []), ...(week.ministry ?? []), ...(week.living ?? [])];

    const chairman   = ga('chairman',   week.chairman);
    const openPrayer = ga('openPrayer', week.openPrayer);
    const closePrayer = ga('closePrayer', week.closePrayer);

    const roleGaps = [chairman, openPrayer, closePrayer].filter((v) => !String(v ?? '').trim()).length;
    const partGaps = allParts.reduce((sum, p) => {
      const a0 = ga(`${p.id}_0`, (p.assign ?? [])[0] ?? '');
      const a1 = ga(`${p.id}_1`, (p.assign ?? [])[1] ?? '');
      const isPair = String(p.roleLabel ?? '').includes('/') && !p.hideHelper;
      const assigned = [a0, isPair ? a1 : null].filter(Boolean).length;
      return sum + Math.max((isPair ? 2 : 1) - assigned, 0);
    }, 0);
    const gaps = roleGaps + partGaps;

    const cbs = week.living?.find((p) => p.cat === 'cbs');
    const reading = allParts.find((p) => p.cat === 'reading');
    const keys = [
      { role: '主席', who: chairman },
      cbs ? { role: '研經班', who: [ga(`${cbs.id}_0`, (cbs.assign ?? [])[0] ?? ''), ga(`${cbs.id}_1`, (cbs.assign ?? [])[1] ?? '')].filter(Boolean).join(' / ') } : null,
      reading ? { role: '經文朗讀', who: ga(`${reading.id}_0`, (reading.assign ?? [])[0] ?? '') } : null,
    ].filter(Boolean);

    // Full detail for the expanded card
    function partDetail(parts) {
      return parts.map((p) => {
        const isPair = p.roleLabel?.includes('/') && !p.hideHelper;
        const rls = p.roleLabel?.split('/') ?? [];
        const a0 = ga(`${p.id}_0`, (p.assign ?? [])[0] ?? '');
        const a1 = ga(`${p.id}_1`, (p.assign ?? [])[1] ?? '');
        if (isPair) {
          return [
            { role: `${p.title}${rls[0] ? `（${rls[0]}）` : ''}`, who: a0 },
            { role: `${p.title}${rls[1] ? `（${rls[1]}）` : '（助手）'}`, who: a1 },
          ];
        }
        const roleSuffix = rls[0] ? `（${rls[0]}）` : '';
        return [{ role: `${p.title}${roleSuffix}`, who: a0 }];
      }).flat();
    }

    const detail = [
      { role: '主席', who: chairman },
      { role: '開始禱告', who: openPrayer },
      { header: '上帝話語的寶藏' },
      ...partDetail(week.treasures ?? []),
      { header: '用心準備傳道工作' },
      ...partDetail(week.ministry ?? []),
      { header: '基督徒的生活' },
      ...partDetail(week.living ?? []),
      { role: '結束禱告', who: closePrayer },
    ];

    return {
      id: `mw_${week.id ?? week.date}`,
      rawDate,
      date: compactDate(week.date),
      wd: weekdayFor(rawDate),
      type: 'mw',
      title: weekType === 'special' && weekLabel
        ? `${weekLabel} — ${week.reading || week.dateLabel || '平日聚會'}`
        : (week.reading || week.dateLabel || '平日聚會'),
      keys,
      detail,
      status: gaps > 0 ? 'gap' : 'ok',
      gaps,
      weekIdx,
      weekType,
    };
  });

  const weekendItems = weekendRows.map((row) => {
    if (row.type === 'event') {
      const rawDate = parseRowDate(row.date);
      return {
        id: `we_${row._id ?? row.id}`,
        rawDate,
        date: compactDate(row.date),
        wd: weekdayFor(rawDate),
        type: 'event',
        title: [row.label, row.note].filter(Boolean).join(' — ') || '特別事項',
        keys: [],
        status: 'suspended',
        gaps: 0,
      };
    }
    if (row.type === 'suspended') {
      const rawDate = parseRowDate(row.date);
      return {
        id: `we_${row._id ?? row.id}`,
        rawDate,
        date: compactDate(row.date),
        wd: weekdayFor(rawDate),
        type: 'event',
        title: [row.label, row.note].filter(Boolean).join(' — ') || '暫停聚會',
        keys: [],
        status: 'suspended',
        gaps: 0,
      };
    }
    const gaps = [row.speaker, row.chair, row.wt, row.read].filter((v) => !String(v ?? '').trim()).length;
    const rawDate = parseRowDate(row.date);
    const detail = [
      { role: '講者', who: row.speaker ? `${row.speaker}${row.cong ? ` · ${row.cong}` : ''}` : '' },
      { role: '主席', who: row.chair || '' },
      { role: '守望台主持', who: row.wt || '' },
      { role: '守望台朗讀', who: row.read || '' },
      ...(row.host ? [{ role: '招待', who: row.host }] : []),
      ...(row.away ? [{ role: '外地安排', who: row.away }] : []),
    ];
    return {
      id: `we_${row._id ?? row.id}`,
      rawDate,
      date: compactDate(row.date),
      wd: weekdayFor(rawDate),
      type: 'we',
      title: row.topic || '公眾演講安排',
      keys: [
        { role: '講者', who: row.speaker ? `${row.speaker}${row.cong ? ` · ${row.cong}` : ''}` : '' },
        { role: '主席', who: row.chair || '' },
        { role: '守望台', who: row.wt || '' },
      ],
      detail,
      status: gaps > 0 ? 'gap' : 'ok',
      gaps,
    };
  });

  return [...midweekItems, ...weekendItems].sort((a, b) => {
    const ta = a.rawDate?.getTime() ?? 0;
    const tb = b.rawDate?.getTime() ?? 0;
    return ta - tb;
  });
}

function groupByMonth(rows) {
  const groups = {};
  rows.forEach((r) => {
    const key = r.rawDate ? `${r.rawDate.getFullYear()}-${r.rawDate.getMonth()}` : 'unknown';
    if (!groups[key]) groups[key] = { year: r.rawDate?.getFullYear(), month: r.rawDate ? r.rawDate.getMonth() + 1 : null, rows: [] };
    groups[key].rows.push(r);
  });
  return Object.values(groups).sort((a, b) => {
    if (!a.year) return 1;
    if (!b.year) return -1;
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
}

// ─── Type badge ───────────────────────────────────────────────────────────────

function TypeBadge({ type }) {
  if (type === 'mw') return <span className="ov-type ov-type--mw">週中</span>;
  if (type === 'we') return <span className="ov-type ov-type--we">週末</span>;
  return <span className="ov-type ov-type--ev">特別</span>;
}

// ─── Needs-attention panel ────────────────────────────────────────────────────

const OV_ALERT_CAP = 3;

function AlertPanel({ rows, onGoToRow }) {
  const gaps = rows.filter((r) => r.status === 'gap');
  const empties = rows.filter((r) => r.status === 'empty');
  const total = gaps.length + empties.length;

  if (!total) {
    return (
      <div className="ag-alert ag-alert--clear">
        <span className="ag-alert__tick">✓</span>
        <div className="ag-alert__copy">
          <b>全部就緒</b>
          <span>已上傳的聚會都排定了，沒有空缺。</span>
        </div>
      </div>
    );
  }

  const shown = gaps.slice(0, OV_ALERT_CAP);
  const moreGaps = gaps.length - shown.length;

  function gapChips(r) {
    const items = r.detail ?? r.keys;
    return items.filter((k) => !k.header && !k.who).map((k) => k.role);
  }

  function renderChips(r) {
    const all = gapChips(r);
    const shown = all.slice(0, 3);
    const extra = all.length - shown.length;
    return (
      <>
        {shown.map((chip, i) => <span key={i} className="ag-need__chip">{chip}</span>)}
        {extra > 0 && <span className="ag-need__chip ag-need__chip--more">+{extra}</span>}
      </>
    );
  }

  return (
    <div className="ag-alert">
      <div className="ag-alert__head">
        <span className="ag-alert__dot" />
        <h3 className="ag-alert__h">需要你處理</h3>
        <span className="ag-alert__count">{total} 場待補</span>
      </div>

      {shown.length > 0 && (
        <div className="ag-alert__list">
          {shown.map((r) => (
            <button key={r.id} className="ag-alert__row" onClick={() => onGoToRow(r)}>
              <span className="ag-alert__date">
                <b>{r.date}</b>
                <small>週{r.wd}</small>
              </span>
              <span className="ag-alert__main">
                <span className="ag-alert__title">
                  <TypeBadge type={r.type} />
                  {r.title}
                </span>
                <div className="ag-need__chips">{renderChips(r)}</div>
              </span>
              <span className="ag-alert__cta">指派 ›</span>
            </button>
          ))}
        </div>
      )}

      {moreGaps > 0 && (
        <button className="ag-alert__more">
          還有 {moreGaps} 場有空缺 — 全部顯示 ›
        </button>
      )}

      {empties.length > 0 && (
        <button className="ag-backlog" onClick={() => onGoToRow(empties[0])}>
          <span className="ag-backlog__txt">
            <b>{empties.length} 場聚會尚未開始排定</b>
            <small>
              {empties[0].date} – {empties[empties.length - 1].date}
              　已上傳，依進度逐步安排即可
            </small>
          </span>
          <span className="ag-alert__cta">開始排定 ›</span>
        </button>
      )}
    </div>
  );
}

// ─── Single agenda item ───────────────────────────────────────────────────────

function AgItem({ row, open, onToggle, onGoToRow }) {
  const { status } = row;

  function gapChips() {
    const items = row.detail ?? row.keys;
    return items.filter((k) => !k.header && !k.who).map((k) => k.role);
  }

  function renderChips() {
    const all = gapChips();
    const shown = all.slice(0, 3);
    const extra = all.length - shown.length;
    return (
      <>
        {shown.map((chip, i) => <span key={i} className="ag-need__chip">{chip}</span>)}
        {extra > 0 && <span className="ag-need__chip ag-need__chip--more">+{extra}</span>}
      </>
    );
  }

  if (status === 'ok') {
    const items = row.detail ?? row.keys;
    return (
      <div className={`ag-item ag-item--ok${open ? ' open' : ''}`}>
        <div className="ag-date">
          <b>{row.date}</b>
          <small>週{row.wd}</small>
        </div>
        <div className="ag-card">
          <button className="ag-row" onClick={onToggle}>
            <span className="ag-top">
              <TypeBadge type={row.type} />
              <span className="ag-title">{row.title}</span>
            </span>
            <span className="ag-ready">就緒</span>
            <span className="ag-caret">›</span>
          </button>
          <div className="ag-detail">
            <div className="ag-roles">
              {items.map((k, i) =>
                k.header ? (
                  <div key={i} className="ag-role-section">{k.header}</div>
                ) : (
                  <div key={i} className={`ag-role${!k.who ? ' is-miss' : ''}`}>
                    <span className="ag-role__lbl">{k.role}</span>
                    <span className="ag-role__who">{k.who || '未指派'}</span>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'empty') {
    return (
      <div className="ag-item ag-item--empty">
        <div className="ag-date">
          <b>{row.date}</b>
          <small>週{row.wd}</small>
        </div>
        <div className="ag-card">
          <button className="ag-row" onClick={() => onGoToRow(row)}>
            <span className="ag-top">
              <TypeBadge type={row.type} />
              <span className="ag-title">{row.title}</span>
            </span>
            <span className="ag-todo">尚未排定</span>
            <span className="ag-caret">›</span>
          </button>
        </div>
      </div>
    );
  }

  if (status === 'suspended') {
    return (
      <div className="ag-item ag-item--susp">
        <div className="ag-date">
          <b>{row.date}</b>
          <small>{row.wd ? `週${row.wd}` : ''}</small>
        </div>
        <div className="ag-card">
          <div className="ag-row ag-row--static">
            <span className="ag-top">
              <TypeBadge type={row.type} />
              <span className="ag-title">{row.title}</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  // gap — open and action-forward
  return (
    <div className="ag-item ag-item--gap">
      <div className="ag-date">
        <b>{row.date}</b>
        <small>週{row.wd}</small>
      </div>
      <div className="ag-card">
        <div className="ag-row ag-row--static">
          <span className="ag-top">
            <TypeBadge type={row.type} />
            <span className="ag-title">{row.title}</span>
          </span>
          <span className="ag-gapcount">{row.gaps} 個空缺</span>
        </div>
        <div className="ag-need">
          <span className="ag-need__lbl">待補</span>
          <div className="ag-need__chips">{renderChips()}</div>
        </div>
        <button className="btn btn--primary ag-go" onClick={() => onGoToRow(row)}>
          前往編排 ›
        </button>
      </div>
    </div>
  );
}

// ─── Month section ────────────────────────────────────────────────────────────

function MonthSection({ year, month, rows, openItems, onToggle, onGoToRow }) {
  const monthLabel = month ? `${month} 月` : '未知月份';
  const yearLabel = year ? `${year} 年` : '';
  const nonSuspended = rows.filter((r) => r.status !== 'suspended');
  const done = nonSuspended.filter((r) => r.status === 'ok').length;
  const total = nonSuspended.length;
  const need = total - done;
  const pct = total ? Math.round((done / total) * 100) : 100;

  return (
    <section className="ag-month">
      <div className="ag-month__head">
        <h3 className="ag-month__title">
          <span className="ag-month__year">{yearLabel} </span>
          {monthLabel}
        </h3>
        <div className="ag-month__meta">
          <span>{total} 場聚會</span>
          {need > 0
            ? <span className="ag-month__need">{need} 場待補</span>
            : <span className="ag-month__ok">全部就緒</span>
          }
        </div>
        <div className="ag-bar"><span style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="ag-tl">
        {rows.map((r) => (
          <AgItem
            key={r.id}
            row={r}
            open={openItems.has(r.id)}
            onToggle={() => onToggle(r.id)}
            onGoToRow={onGoToRow}
          />
        ))}
      </div>
    </section>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

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

// ─── Main ─────────────────────────────────────────────────────────────────────

const FILTERS = ['all', 'mw', 'we', 'gap'];
const FILTER_LABELS = { all: '全部', mw: '週中', we: '週末', gap: '待補' };

export default function OverviewPage({
  midweekWeeks = [],
  weekendRows = [],
  getAssign,
  loading = false,
  canEdit = false,
  onNavigate,
  setWeek,
  setView,
}) {
  const [tab, setTab] = useState('schedule');
  const activeTab = tab === 'changes' && !canEdit ? 'schedule' : tab;
  const [filter, setFilter] = useState('all');
  const [showPast, setShowPast] = useState(false);
  const [openItems, setOpenItems] = useState(new Set());
  const [toast, setToast] = useState(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function toggleItem(id) {
    setOpenItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const allRows = buildOverviewRows(midweekWeeks, weekendRows, getAssign);

  function filterRow(r) {
    if (filter === 'gap') return r.status === 'gap' || r.status === 'empty';
    if (filter !== 'all') return r.type === filter;
    return true;
  }

  const futureRows = allRows.filter((r) => (!r.rawDate || r.rawDate >= today) && filterRow(r));
  const pastRows = allRows.filter((r) => r.rawDate && r.rawDate < today && filterRow(r));

  const futureGroups = groupByMonth(futureRows);
  const pastGroups = groupByMonth(pastRows);

  // For the alert panel, use all future rows regardless of filter
  const alertRows = allRows.filter((r) => !r.rawDate || r.rawDate >= today);

  function onGoToRow(row) {
    if (row.type === 'mw' && row.weekIdx != null) {
      setWeek?.(row.weekIdx);
      setView?.('midweek');
    } else {
      setView?.('weekend');
    }
    onNavigate('meetings');
  }

  return (
    <section className="ov-section">
      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button
            className="tab"
            role="tab"
            aria-selected={activeTab === 'schedule' ? 'true' : 'false'}
            onClick={() => setTab('schedule')}
          >
            安排
          </button>
          {canEdit && (
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'changes' ? 'true' : 'false'}
              onClick={() => setTab('changes')}
            >
              最近變更
            </button>
          )}
        </div>
      </div>

      {activeTab === 'changes' && <ChangesPanel />}

      {activeTab === 'schedule' && (
        <div id="ovBody">
          {activeTab === 'schedule' && (
            <div className="chips ov-chips" role="group">
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
          {loading && <div className="people-empty">正在載入會眾資料…</div>}

          {!loading && allRows.length === 0 && (
            <div className="people-empty">目前沒有可顯示的聚會或週末安排。</div>
          )}

          {!loading && allRows.length > 0 && (
            <>
              <AlertPanel rows={alertRows} onGoToRow={onGoToRow} />

              {futureGroups.map((g) => (
                <MonthSection
                  key={`${g.year}-${g.month}`}
                  year={g.year}
                  month={g.month}
                  rows={g.rows}
                  openItems={openItems}
                  onToggle={toggleItem}
                  onGoToRow={onGoToRow}
                />
              ))}

              {pastRows.length > 0 && (
                <button className="ov-past-toggle" onClick={() => setShowPast((v) => !v)}>
                  {showPast ? '▲ 隱藏過去的安排' : `▼ 查看過去 ${pastRows.length} 項安排`}
                </button>
              )}

              {showPast && pastGroups.map((g) => (
                <MonthSection
                  key={`past-${g.year}-${g.month}`}
                  year={g.year}
                  month={g.month}
                  rows={g.rows}
                  openItems={openItems}
                  onToggle={toggleItem}
                  onGoToRow={onGoToRow}
                />
              ))}
            </>
          )}
        </div>
      )}

      <OvToast toast={toast} onHide={() => setToast(null)} />
    </section>
  );
}
