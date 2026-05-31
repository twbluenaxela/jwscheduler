'use client';
import { useEffect, useRef } from 'react';
import { midweekWeeks } from '../data/index';
import MidweekWeek from './MidweekWeek';
import WeekendView from './WeekendView';

const EXPORT_ITEMS = [
  { ic: '▦', label: '分享圖片 (JPG)', sub: '貼到 LINE 群組' },
  { ic: '▭', label: '複製到剪貼簿' },
  null,
  { ic: '▤', label: '匯出 Excel', sub: '沿用原本表格格式' },
  { ic: '▥', label: '匯出 PDF' },
  { ic: '⎙', label: '列印' },
];

export default function MeetingsPage({
  view, setView, week, setWeek,
  editMode, setEditMode, exportOpen, setExportOpen,
  weekendFilter, setWeekendFilter,
  getAssign, openSheet, onEdit,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = () => setExportOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [exportOpen, setExportOpen]);

  const totalWeeks = midweekWeeks.length;

  return (
    <section>
      {/* Toolbar */}
      <div className="toolbar">
        <div className="tabs" role="tablist">
          <button
            className="tab"
            role="tab"
            aria-selected={view === 'midweek' ? 'true' : 'false'}
            onClick={() => setView('midweek')}
          >聚會</button>
          <button
            className="tab"
            role="tab"
            aria-selected={view === 'weekend' ? 'true' : 'false'}
            onClick={() => setView('weekend')}
          >週末</button>
        </div>
        <div className="toolbar__spacer" />

        {/* Week nav — only for midweek */}
        {view === 'midweek' && (
          <div className="weeknav">
            <button className="iconbtn" aria-label="上一週" onClick={() => setWeek((w) => (w - 1 + totalWeeks) % totalWeeks)}>‹</button>
            <button className="iconbtn" aria-label="下一週" onClick={() => setWeek((w) => (w + 1) % totalWeeks)}>›</button>
          </div>
        )}

        <button
          className={`btn${editMode ? ' btn--primary' : ''}`}
          onClick={() => setEditMode((e) => !e)}
        >
          <span className="pen">{editMode ? '✓' : '✎'}</span>
          <span>{editMode ? '完成' : '編輯'}</span>
        </button>

        <div className="menuwrap" ref={menuRef}>
          <button
            className="btn btn--primary"
            onClick={(e) => { e.stopPropagation(); setExportOpen((o) => !o); }}
          >
            匯出 <span className="caret">▾</span>
          </button>
          {exportOpen && (
            <div className="menu" onClick={(e) => e.stopPropagation()}>
              {EXPORT_ITEMS.map((item, i) =>
                item === null ? (
                  <div key={i} className="menu__div" />
                ) : (
                  <button key={i} className="menu__item">
                    <span className="menu__ic">{item.ic}</span>
                    {item.label}
                    {item.sub && <small>{item.sub}</small>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit banner */}
      {editMode && (
        <div className="edit-banner">
          <span className="pen">✎</span>
          編輯模式 — 點任何文字即可直接修改。完成後按「完成」儲存。
        </div>
      )}

      {/* Midweek view */}
      {view === 'midweek' && (
        <MidweekWeek
          week={midweekWeeks[week]}
          editMode={editMode}
          getAssign={getAssign}
          openSheet={openSheet}
          onEdit={onEdit}
        />
      )}

      {/* Weekend view */}
      {view === 'weekend' && (
        <WeekendView
          filter={weekendFilter}
          setFilter={setWeekendFilter}
          getAssign={getAssign}
          openSheet={openSheet}
        />
      )}
    </section>
  );
}
