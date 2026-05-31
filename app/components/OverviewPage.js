'use client';
import { useState } from 'react';
import { overviewData } from '../data/index';

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

export default function OverviewPage() {
  const [filter, setFilter] = useState('all');

  const rows = overviewData.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'gap') return r.status === 'gap' || r.status === 'empty';
    return r.type === filter;
  });

  return (
    <section>
      <div className="toolbar">
        <span className="toolbar__title">總覽 · 2026 年 6 月</span>
        <div className="toolbar__spacer" />
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
      </div>

      <div className="ov-list">
        {rows.map((r, i) => (
          <button key={i} className={`ov-row ov-row--${r.status}`}>
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
            <span className="ov-caret">›</span>
          </button>
        ))}
      </div>
    </section>
  );
}
