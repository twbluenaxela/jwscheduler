'use client';
import { useState } from 'react';

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

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];

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
    const roleGaps = missingCount([
      week.chairman,
      week.openPrayer,
      week.closePrayer,
    ]);
    const partGaps = [...(week.treasures ?? []), ...(week.ministry ?? []), ...(week.living ?? [])]
      .reduce((sum, part) => sum + partGapCount(part), 0);
    const gaps = roleGaps + partGaps;

    const keys = [
      `主席 ${week.chairman || '未指派'}`,
      cbs ? `研經班 ${(cbs.assign ?? []).filter(Boolean).join(' / ') || '未指派'}` : null,
      reading ? `經文朗讀 ${(reading.assign ?? []).filter(Boolean).join(' / ') || '未指派'}` : null,
    ].filter(Boolean);

    return {
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
        date: row.date,
        wd: '',
        type: 'event',
        title: [row.label, row.note].filter(Boolean).join(' — ') || '特別事項',
        keys: [],
        status: 'suspended',
      };
    }

    const gaps = missingCount([row.speaker, row.chair, row.wt, row.read]);
    return {
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

export default function OverviewPage({ midweekWeeks = [], weekendRows = [], loading = false }) {
  const [filter, setFilter] = useState('all');
  const overviewData = buildOverviewRows(midweekWeeks, weekendRows);

  const rows = overviewData.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'gap') return r.status === 'gap' || r.status === 'empty';
    return r.type === filter;
  });

  return (
    <section>
      <div className="toolbar">
        <span className="toolbar__title">總覽 · 會眾資料</span>
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
        {loading && <div className="people-empty">正在載入會眾資料…</div>}
        {!loading && rows.length === 0 && (
          <div className="people-empty">目前沒有可顯示的聚會或週末安排。</div>
        )}
        {!loading && rows.map((r, i) => (
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
