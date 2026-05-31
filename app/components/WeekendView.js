'use client';
import { weekendData } from '../data/index';

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

export default function WeekendView({ filter, setFilter, getAssign, openSheet }) {
  const today = new Date();
  const thisYear = today.getFullYear();

  function parseDate(dateStr) {
    const [m, d] = dateStr.replace('日', '').split('/').map(Number);
    return new Date(thisYear, m - 1, d);
  }

  const rows = filter === 'upcoming'
    ? weekendData.filter((r) => r.type === 'event' || parseDate(r.date) >= today)
    : weekendData;

  return (
    <div className="wk-wrap">
      <div className="wk-title">
        <h2>新屋會眾 <span className="yr">{thisYear}</span> 公眾演講安排表</h2>
        <span className="wk-title__meta">每週日 09:30 · 共 {weekendData.filter(r => !r.type || r.type === 'special').length} 場</span>
        <div className="wk-title__spacer" />
        <div className="chips" role="group">
          <button
            className="chip"
            aria-pressed={filter === 'all' ? 'true' : 'false'}
            onClick={() => setFilter('all')}
          >全部</button>
          <button
            className="chip"
            aria-pressed={filter === 'upcoming' ? 'true' : 'false'}
            onClick={() => setFilter('upcoming')}
          >未來</button>
        </div>
      </div>

      {/* Desktop table */}
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
            {rows.map((r, i) => {
              if (r.type === 'event') {
                return (
                  <tr key={i} className="is-event">
                    <td className="td-date">{r.date}</td>
                    <td colSpan={9}>
                      <span className="event-tag">◆ {r.label}</span>
                      　<span style={{ fontWeight: 600, color: 'var(--ink-3)' }}>{r.note}</span>
                    </td>
                  </tr>
                );
              }
              const cls = r.type === 'special' ? 'is-special' : '';
              const key = `we${i}`;
              return (
                <tr key={i} className={cls}>
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

      {/* Mobile cards */}
      <div className="wk-cards">
        {rows.map((r, i) => {
          if (r.type === 'event') {
            return (
              <div key={i} className="wk-card is-event">
                <div className="wk-card__top"><span className="wk-card__date">{r.date}</span></div>
                <div className="wk-card__topic">◆ {r.label}</div>
                <div style={{ color: 'var(--ink-3)', fontWeight: 600, fontSize: '13.5px' }}>{r.note}</div>
              </div>
            );
          }
          const cls = r.type === 'special' ? 'is-special' : '';
          const key = `we${i}`;
          return (
            <div key={i} className={`wk-card ${cls}`}>
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
