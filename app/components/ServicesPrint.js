'use client';

// The 服務 schedule as it is printed: every category of the month, read-only.
//
// The live page shows ONE category at a time and its cells are buttons. The
// export needs the whole month — 麥克風服務 / 影音操作 / 招待 / 講台服務 / 打掃 /
// 帶頭傳道 — on one sheet, so this renders the same data as plain text tables
// (no buttons, no edit affordances) and is consumed through PrintStage.
//
// `monthData` is the /api/services/month payload (dates, assignments, cleaning,
// field). One payload carries every category, so the caller passes it once.

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const dateLabel = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${m}/${d}（${WEEKDAYS[new Date(y, m - 1, d).getDay()]}）`;
};

const monthLabel = (month) => {
  const [y, m] = String(month).split('-').map(Number);
  return `${y}年${m}月服務安排`;
};

// Rows for a slot category: every meeting date of the month, one assignment per
// position — the same data SlotView renders, without the buttons.
function slotRows(category, monthData) {
  const dates = [
    ...new Set([
      ...(monthData.dates ?? []).map((d) => d.iso),
      ...(monthData.assignments ?? [])
        .filter((a) => a.categoryId === category.id)
        .map((a) => a.date),
    ]),
  ].sort();
  return dates.map((date) => ({
    key: date,
    label: dateLabel(date),
    cells: category.positions.map((position) => {
      const assignment = (monthData.assignments ?? []).find(
        (item) => item.categoryId === category.id && item.date === date && item.position === position,
      );
      return assignment?.personName || assignment?.text || '';
    }),
  }));
}

// 打掃 is a per-month group list, not a per-date grid.
function groupRows(category, monthData) {
  const entry = (monthData.cleaning ?? []).find((item) => item.categoryId === category.id);
  const groups = (entry?.text || '')
    .split(/[,+]/)
    .map((group) => group.trim())
    .filter(Boolean);
  return [{ key: 'groups', label: '本月', cells: [groups.length ? groups.join('＋') : '未安排'] }];
}

// 帶頭傳道 lists the month's meetings with place, leader and territory.
function fieldRows(monthData) {
  return (monthData.field ?? []).map((meeting) => {
    const [y, m, d] = String(meeting.date).split('-').map(Number);
    const weekday = y ? WEEKDAYS[new Date(y, m - 1, d).getDay()] : '';
    return {
      key: `field-${meeting.id}`,
      label: `${m}/${d}（${weekday}）${meeting.time}`,
      cells: [meeting.place || '', meeting.leaderName || '尚未安排', meeting.territory || ''],
    };
  });
}

function ServicePrintBlock({ category, monthData }) {
  if (category.kind === 'field' && !(monthData.field ?? []).length) return null;
  const rows = category.kind === 'slots' ? slotRows(category, monthData)
    : category.kind === 'groups' ? groupRows(category, monthData)
    : fieldRows(monthData);
  if (!rows.length) return null;

  const headers = category.kind === 'groups'
    ? ['月份', '負責小組']
    : category.kind === 'field'
      ? ['時間', '集合地點', '帶頭的人', '區域']
      : ['日期', ...category.positions];

  return (
    <section className="svc-print-block">
      <h3>{category.name}</h3>
      <table className="svc-print-table">
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              <th scope="row">{row.label}</th>
              {row.cells.map((cell, index) => (
                <td key={`${row.key}-${index}`}>{cell || '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {category.notes && (
        <div className="svc-print-notes">
          {String(category.notes).split('\n').map((line, index) => (
            <div key={`note-${index}`}>{line || '\u00a0'}</div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function ServicesPrintSheet({ title, month, categories = [], monthData }) {
  const hasData = Boolean(monthData);
  const meetings = monthData?.dates?.length ?? 0;
  return (
    <div className="svc-print">
      <header className="svc-print-head">
        <h2>{title || monthLabel(month)}</h2>
        <span className="svc-print-meta">
          {meetings ? `共 ${meetings} 次聚會` : monthLabel(month)}
        </span>
      </header>
      {hasData && categories.map((category) => (
        <ServicePrintBlock
          key={`svc-print-${category.id}`}
          category={category}
          monthData={monthData}
        />
      ))}
      {!hasData && <p className="svc-print-empty">這個月還沒有服務安排。</p>}
    </div>
  );
}
