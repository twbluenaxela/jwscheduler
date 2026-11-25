'use client';

// The 週末 table as it is printed.
//
// The on-screen table hides itself and shows mobile cards at ≤720px, so a
// screenshot taken on a phone would capture the card list, not the table. This
// component always renders the DESKTOP table markup (the same columns, row
// classes and name pills as WeekendView) and is only ever used inside a
// PrintStage, where the print CSS forces the table layout and a white page.
//
// One instance = one A4 page: the export chunks the visible rows
// (`weekendPrintChunks` in lib/weekendPrint.mjs) and repeats the title and
// header on every chunk, so a long service year never needs a split row.
export default function WeekendPrintTable({ rows = [], getAssign, title = '公眾演講安排表' }) {
  const isEventLike = (r) => r.type === 'event' || r.type === 'suspended';
  const name = (r, field, fallback) => {
    const value = typeof getAssign === 'function' ? getAssign(`we${r._id}_${field}`, fallback) : fallback;
    return value || '';
  };
  const scheduleCount = rows.filter((r) => !r.type || r.type === 'schedule' || r.type === 'special').length;

  return (
    <div className="wk-wrap">
      <div className="wk-title">
        <h2>{title}</h2>
        <span className="wk-title__meta">共 {scheduleCount} 場</span>
      </div>

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
              if (isEventLike(r)) {
                return (
                  <tr key={r._id} className={r.type === 'suspended' ? 'is-suspended' : 'is-event'}>
                    <td className="td-date">{r.date}</td>
                    <td colSpan={9}>
                      <span className="event-tag">◆ {r.label}</span>
                      　<span className="we-print-note">{r.note}</span>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={r._id} className={r.type === 'special' ? 'is-special' : ''}>
                  <td className="td-date">{r.date}</td>
                  <td className="td-no">{r.no ?? ''}</td>
                  <td className="td-topic">{r.topic}</td>
                  <td className="td-cong">{r.cong}</td>
                  <td><NamePrint value={name(r, 'speaker', r.speaker)} /></td>
                  <td><NamePrint value={name(r, 'chair', r.chair)} /></td>
                  <td><NamePrint value={name(r, 'wt', r.wt)} /></td>
                  <td><NamePrint value={name(r, 'read', r.read)} /></td>
                  <td>{r.host ? <span className="host-badge">{r.host}</span> : <NamePrint value="" />}</td>
                  <td>{r.away ? <span className="away-chip">{r.away}</span> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Names print as plain text (an unassigned slot is a blank to write on), not as
// the screen's tappable pill.
function NamePrint({ value }) {
  return <span className={`name-pill${value ? '' : ' name-pill--empty'}`}>{value || '—'}</span>;
}
