'use client';
import { useMemo, useState } from 'react';

function NamePill({ slotId, defaultName, catKey, ctxLabel, getAssign, openSheet }) {
  const name = getAssign(slotId, defaultName);
  const isEmpty = !name;
  return (
    <span
      className={`name-pill${isEmpty ? ' name-pill--empty' : ''}`}
      data-cat={catKey}
      onClick={() => openSheet(slotId, catKey, ctxLabel, name)}
    >
      {name || '—'}
    </span>
  );
}

const FILTER_OPTIONS = [
  { key: 'upcoming', label: '未來' },
  { key: 'month',    label: '本月' },
  { key: 'half',     label: '半年' },
  { key: 'all',      label: '全部' },
];

export default function WeekendView({ filter, setFilter, weekendRows = [], getAssign, openSheet }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisYear = today.getFullYear();

  // Parse "M/D" date strings, assigning the year that places the date
  // closest to today (preferring the nearest future date).
  function parseDate(dateStr, hintYear) {
    const parts = String(dateStr ?? '').replace('日', '').split('/').map(Number);
    if (parts.length < 2) return null;
    const [m, d] = parts;
    const baseYear = hintYear ?? thisYear;
    const candidates = [baseYear - 1, baseYear, baseYear + 1].map(y => new Date(y, m - 1, d));
    const future = candidates.filter(c => c >= today);
    return future.length ? future[0] : candidates[candidates.length - 1];
  }

  // Derive all years present in the data
  const availableYears = useMemo(() => {
    const years = new Set();
    weekendRows.forEach(r => {
      const d = parseDate(r.date);
      if (d) years.add(d.getFullYear());
    });
    return [...years].sort();
  }, [weekendRows]);

  const [selectedYear, setSelectedYear] = useState(() => thisYear);

  function inRange(r) {
    const d = parseDate(r.date, selectedYear);
    // Year gate
    if (d && d.getFullYear() !== selectedYear) return false;
    if (r.type === 'event') return true;
    if (!d) return true;
    if (filter === 'upcoming') return d >= today;
    if (filter === 'month') {
      return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth();
    }
    if (filter === 'half') {
      const cutoff = new Date(today);
      cutoff.setMonth(cutoff.getMonth() + 6);
      return d >= today && d <= cutoff;
    }
    return true; // 'all'
  }

  const rows = weekendRows.filter(inRange);
  const scheduleCount = rows.filter(r => !r.type || r.type === 'schedule' || r.type === 'special').length;

  return (
    <div className="wk-wrap">
      <div className="wk-title">
        <h2>公眾演講安排表</h2>
        <span className="wk-title__meta">共 {scheduleCount} 場</span>
        <div className="wk-title__spacer" />
        {availableYears.length > 1 && (
          <div className="chips" role="group" style={{ marginRight: 6 }}>
            {availableYears.map(y => (
              <button
                key={y}
                className="chip"
                aria-pressed={selectedYear === y ? 'true' : 'false'}
                onClick={() => setSelectedYear(y)}
              >{y}</button>
            ))}
          </div>
        )}
        <div className="chips" role="group">
          {FILTER_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              className="chip"
              aria-pressed={filter === key ? 'true' : 'false'}
              onClick={() => setFilter(key)}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Desktop table */}
      {rows.length === 0 ? (
        <div className="people-empty">目前沒有週末安排資料。</div>
      ) : (
      <div className="tablescroll">
        <table className="wk-table">
          <thead>
            <tr>
              <th>日期</th><th>編號</th><th>演講主題</th><th>會眾</th>
              <th>講者</th><th>主席</th><th>守望台</th><th>朗讀</th>
              <th>招待</th><th>外地演講安排</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.type === 'event') {
                return (
                  <tr key={r._id} className="is-event">
                    <td className="td-date">{r.date}</td>
                    <td colSpan={9}>
                      <span className="event-tag">◆ {r.label}</span>
                      　<span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{r.note}</span>
                    </td>
                  </tr>
                );
              }
              const cls = r.type === 'special' ? 'is-special' : '';
              const key = `we${r._id}`;
              return (
                <tr key={r._id} className={cls}>
                  <td className="td-date">{r.date}</td>
                  <td className="td-no">{r.no ?? ''}</td>
                  <td className="td-topic">{r.topic}</td>
                  <td className="td-cong">{r.cong}</td>
                  <td><NamePill slotId={`${key}_speaker`} defaultName={r.speaker} catKey="publictalk" ctxLabel={`${r.date}（日）`} getAssign={getAssign} openSheet={openSheet} /></td>
                  <td><NamePill slotId={`${key}_chair`}   defaultName={r.chair}   catKey="wt"         ctxLabel={`${r.date}（日）`} getAssign={getAssign} openSheet={openSheet} /></td>
                  <td><NamePill slotId={`${key}_wt`}      defaultName={r.wt}      catKey="wt"         ctxLabel={`${r.date}（日）`} getAssign={getAssign} openSheet={openSheet} /></td>
                  <td><NamePill slotId={`${key}_read`}    defaultName={r.read}    catKey="wtread"     ctxLabel={`${r.date}（日）`} getAssign={getAssign} openSheet={openSheet} /></td>
                  <td>{r.host ? <span className="host-badge">{r.host}</span> : <span className="name-pill name-pill--empty">—</span>}</td>
                  <td>{r.away ? <span className="away-chip">{r.away}</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Mobile cards */}
      <div className="wk-cards">
        {rows.map((r) => {
          if (r.type === 'event') {
            return (
              <div key={r._id} className="wk-card is-event">
                <div className="wk-card__top"><span className="wk-card__date">{r.date}</span></div>
                <div className="wk-card__topic">◆ {r.label}</div>
                <div style={{ color: 'var(--ink-3)', fontWeight: 600, fontSize: '13.5px' }}>{r.note}</div>
              </div>
            );
          }
          const cls = r.type === 'special' ? 'is-special' : '';
          const key = `we${r._id}`;
          return (
            <div key={r._id} className={`wk-card ${cls}`}>
              <div className="wk-card__top">
                <span className="wk-card__date">{r.date}</span>
                {r.no && <span className="wk-card__no">編號 {r.no}</span>}
              </div>
              <div className="wk-card__topic">{r.topic}</div>
              <dl className="wk-card__grid">
                <dt>會眾</dt><dd>{r.cong}</dd>
                <dt>講者</dt><dd>{getAssign(`${key}_speaker`, r.speaker) || '—'}</dd>
                <dt>主席</dt><dd>{getAssign(`${key}_chair`, r.chair) || '—'}</dd>
                <dt>守望台</dt><dd>{getAssign(`${key}_wt`, r.wt) || '—'}</dd>
                <dt>朗讀</dt><dd>{getAssign(`${key}_read`, r.read) || '—'}</dd>
                <dt>招待</dt><dd>{r.host ? <span className="host-badge">{r.host}</span> : '—'}</dd>
              </dl>
              {r.away && (
                <div className="wk-card__foot">
                  <span style={{ color: 'var(--ink-3)', fontWeight: 700, fontSize: '12.5px' }}>外地演講</span>
                  <span className="away-chip">{r.away}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="legend">
        <span><i style={{ background: 'var(--special)' }} />特別週／國際大會</span>
        <span><i style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} />招待組別</span>
        <span><i style={{ background: 'var(--living-soft)', border: '1px solid var(--living)' }} />外地演講安排</span>
      </div>
    </div>
  );
}
