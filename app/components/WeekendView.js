'use client';
import { useMemo, useRef, useState } from 'react';

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

function EditCell({ value, onCommit, placeholder = '—', mono = false }) {
  const [val, setVal] = useState(value ?? '');
  const committed = useRef(value ?? '');

  // sync if parent changes the value (e.g. after DB save)
  if (value !== committed.current && value !== val) {
    setVal(value ?? '');
    committed.current = value ?? '';
  }

  return (
    <input
      className={`we-edit-cell${mono ? ' we-edit-cell--mono' : ''}`}
      value={val}
      placeholder={placeholder}
      onChange={e => setVal(e.target.value)}
      onBlur={() => {
        if (val !== committed.current) {
          committed.current = val;
          onCommit(val);
        }
      }}
    />
  );
}

export default function WeekendView({ filter, setFilter, weekendRows = [], getAssign, openSheet, editMode = false, updateRow, deleteRow }) {
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

  const isEventLike = (r) => r.type === 'event' || r.type === 'suspended';

  function inRange(r) {
    const d = parseDate(r.date, selectedYear);
    // Year gate
    if (d && d.getFullYear() !== selectedYear) return false;
    if (isEventLike(r)) return true;
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

  // Cycle: schedule → special → schedule (for schedule rows)
  //        event → suspended → event (for event-like rows)
  function cycleType(r) {
    if (r.type === 'special') return 'schedule';
    if (r.type === 'schedule' || !r.type) return 'special';
    if (r.type === 'suspended') return 'event';
    return 'suspended'; // event → suspended
  }

  function typeLabel(type) {
    if (type === 'special') return '特別';
    if (type === 'suspended') return '暫停';
    return '正常';
  }

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
              {editMode && <th></th>}
              {editMode && <th></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (isEventLike(r)) {
                const trCls = r.type === 'suspended' ? 'is-suspended' : 'is-event';
                return (
                  <tr key={r._id} className={trCls}>
                    <td className="td-date">
                      {editMode ? <EditCell value={r.date} onCommit={v => updateRow(r._id, 'date', v)} placeholder="日期" mono /> : r.date}
                    </td>
                    <td colSpan={editMode ? 7 : 9}>
                      {editMode ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <EditCell value={r.label} onCommit={v => updateRow(r._id, 'label', v)} placeholder="標題" />
                          <EditCell value={r.note}  onCommit={v => updateRow(r._id, 'note',  v)} placeholder="備註" />
                        </div>
                      ) : (
                        <>
                          <span className="event-tag">◆ {r.label}</span>
                          　<span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{r.note}</span>
                        </>
                      )}
                    </td>
                    {editMode && (
                      <>
                        <td>
                          <button
                            className={`we-type-btn we-type-btn--${r.type ?? 'normal'}`}
                            onClick={() => updateRow(r._id, 'type', cycleType(r))}
                            title="切換樣式"
                          >{typeLabel(r.type)}</button>
                        </td>
                        <td>
                          <button className="we-del-btn" onClick={() => deleteRow(r._id)} title="刪除">✕</button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              }
              const cls = r.type === 'special' ? 'is-special' : '';
              const key = `we${r._id}`;
              return (
                <tr key={r._id} className={cls}>
                  <td className="td-date">
                    {editMode ? <EditCell value={r.date} onCommit={v => updateRow(r._id, 'date', v)} placeholder="日期" mono /> : r.date}
                  </td>
                  <td className="td-no">
                    {editMode ? <EditCell value={r.no ?? ''} onCommit={v => updateRow(r._id, 'no', v)} placeholder="編號" mono /> : (r.no ?? '')}
                  </td>
                  <td className="td-topic">
                    {editMode ? <EditCell value={r.topic} onCommit={v => updateRow(r._id, 'topic', v)} placeholder="演講主題" /> : r.topic}
                  </td>
                  <td className="td-cong">
                    {editMode ? <EditCell value={r.cong} onCommit={v => updateRow(r._id, 'cong', v)} placeholder="會眾" /> : r.cong}
                  </td>
                  <td><NamePill slotId={`${key}_speaker`} defaultName={r.speaker} catKey="publictalk" ctxLabel={`${r.date}（日）`} getAssign={getAssign} openSheet={openSheet} /></td>
                  <td><NamePill slotId={`${key}_chair`}   defaultName={r.chair}   catKey="wt"         ctxLabel={`${r.date}（日）`} getAssign={getAssign} openSheet={openSheet} /></td>
                  <td><NamePill slotId={`${key}_wt`}      defaultName={r.wt}      catKey="wt"         ctxLabel={`${r.date}（日）`} getAssign={getAssign} openSheet={openSheet} /></td>
                  <td><NamePill slotId={`${key}_read`}    defaultName={r.read}    catKey="wtread"     ctxLabel={`${r.date}（日）`} getAssign={getAssign} openSheet={openSheet} /></td>
                  <td>
                    {editMode
                      ? <EditCell value={r.host} onCommit={v => updateRow(r._id, 'host', v)} placeholder="招待" />
                      : (r.host ? <span className="host-badge">{r.host}</span> : <span className="name-pill name-pill--empty">—</span>)}
                  </td>
                  <td>
                    {editMode
                      ? <EditCell value={r.away} onCommit={v => updateRow(r._id, 'away', v)} placeholder="外地" />
                      : (r.away ? <span className="away-chip">{r.away}</span> : null)}
                  </td>
                  {editMode && (
                    <>
                      <td>
                        <button
                          className={`we-type-btn${r.type === 'special' ? ' we-type-btn--special' : ''}`}
                          onClick={() => updateRow(r._id, 'type', cycleType(r))}
                          title="切換樣式"
                        >{typeLabel(r.type)}</button>
                      </td>
                      <td>
                        <button className="we-del-btn" onClick={() => deleteRow(r._id)} title="刪除">✕</button>
                      </td>
                    </>
                  )}
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
          if (isEventLike(r)) {
            const cardCls = r.type === 'suspended' ? 'wk-card is-suspended' : 'wk-card is-event';
            return (
              <div key={r._id} className={cardCls}>
                <div className="wk-card__top">
                  {editMode ? <EditCell value={r.date} onCommit={v => updateRow(r._id, 'date', v)} placeholder="日期" mono /> : <span className="wk-card__date">{r.date}</span>}
                  {editMode && (
                    <button
                      className={`we-type-btn we-type-btn--${r.type ?? 'normal'}`}
                      onClick={() => updateRow(r._id, 'type', cycleType(r))}
                    >{typeLabel(r.type)}</button>
                  )}
                  {editMode && <button className="we-del-btn" onClick={() => deleteRow(r._id)}>✕</button>}
                </div>
                {editMode ? (
                  <>
                    <EditCell value={r.label} onCommit={v => updateRow(r._id, 'label', v)} placeholder="標題" />
                    <EditCell value={r.note}  onCommit={v => updateRow(r._id, 'note',  v)} placeholder="備註" />
                  </>
                ) : (
                  <>
                    <div className="wk-card__topic">◆ {r.label}</div>
                    <div style={{ color: 'var(--ink-3)', fontWeight: 600, fontSize: '13.5px' }}>{r.note}</div>
                  </>
                )}
              </div>
            );
          }
          const cls = r.type === 'special' ? 'is-special' : '';
          const key = `we${r._id}`;
          return (
            <div key={r._id} className={`wk-card ${cls}`}>
              <div className="wk-card__top">
                {editMode
                  ? <EditCell value={r.date} onCommit={v => updateRow(r._id, 'date', v)} placeholder="日期" mono />
                  : <span className="wk-card__date">{r.date}</span>}
                {!editMode && r.no && <span className="wk-card__no">編號 {r.no}</span>}
                {editMode && <EditCell value={r.no ?? ''} onCommit={v => updateRow(r._id, 'no', v)} placeholder="編號" mono />}
                {editMode && (
                  <button
                    className={`we-type-btn${r.type === 'special' ? ' we-type-btn--special' : ''}`}
                    onClick={() => updateRow(r._id, 'type', cycleType(r))}
                  >{typeLabel(r.type)}</button>
                )}
                {editMode && <button className="we-del-btn" onClick={() => deleteRow(r._id)}>✕</button>}
              </div>
              {editMode
                ? <EditCell value={r.topic} onCommit={v => updateRow(r._id, 'topic', v)} placeholder="演講主題" />
                : <div className="wk-card__topic">{r.topic}</div>}
              <dl className="wk-card__grid">
                <dt>會眾</dt>
                <dd>{editMode ? <EditCell value={r.cong} onCommit={v => updateRow(r._id, 'cong', v)} placeholder="會眾" /> : r.cong}</dd>
                <dt>講者</dt><dd>{getAssign(`${key}_speaker`, r.speaker) || '—'}</dd>
                <dt>主席</dt><dd>{getAssign(`${key}_chair`, r.chair) || '—'}</dd>
                <dt>守望台</dt><dd>{getAssign(`${key}_wt`, r.wt) || '—'}</dd>
                <dt>朗讀</dt><dd>{getAssign(`${key}_read`, r.read) || '—'}</dd>
                <dt>招待</dt>
                <dd>{editMode
                  ? <EditCell value={r.host} onCommit={v => updateRow(r._id, 'host', v)} placeholder="招待" />
                  : (r.host ? <span className="host-badge">{r.host}</span> : '—')}</dd>
              </dl>
              {(r.away || editMode) && (
                <div className="wk-card__foot">
                  <span style={{ color: 'var(--ink-3)', fontWeight: 700, fontSize: '12.5px' }}>外地演講</span>
                  {editMode
                    ? <EditCell value={r.away} onCommit={v => updateRow(r._id, 'away', v)} placeholder="外地安排" />
                    : <span className="away-chip">{r.away}</span>}
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
