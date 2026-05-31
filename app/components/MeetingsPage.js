'use client';
import { useEffect, useRef, useState } from 'react';
import MidweekWeek from './MidweekWeek';
import WeekendView from './WeekendView';
import {
  copyWeekImageToClipboard,
  downloadWeekJpeg,
  downloadWeekXlsx,
  openWeekPrintWindow,
} from '../lib/midweekExport';

const EXPORT_ITEMS = [
  { ic: '▦', label: '匯出 JPG', sub: '貼到 LINE 群組', action: 'jpg' },
  { ic: '▭', label: '複製到剪貼簿', action: 'copy' },
  null,
  { ic: '▤', label: '匯出 Excel', sub: '沿用原本表格格式', action: 'xlsx' },
  { ic: '▥', label: '匯出 PDF', action: 'pdf' },
  { ic: '⎙', label: '列印', action: 'print' },
];

function getDateLabel(week) {
  if (!week) return '';
  if (week.dateLabel) return week.dateLabel;
  const m = week.date?.match(/(\d+)月\s*(\d+)日/);
  if (!m) return week.date ?? '';
  return `${m[1]}月${m[2]}-${parseInt(m[2]) + 6}日`;
}

function WeekPicker({ weeks, currentWeek, onSelect }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const currentItemRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!containerRef.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => currentItemRef.current?.scrollIntoView({ block: 'nearest' }));
  }, [open]);

  return (
    <div className="wkpick" ref={containerRef}>
      <button
        className={`wkpick__btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="選取週次"
      >
        <span className="wkpick__label">{getDateLabel(weeks[currentWeek])}</span>
        <span className="wkpick__caret">▾</span>
      </button>

      {open && (
        <div className="wkpick__panel" role="listbox" aria-label="選取一週">
          <div className="wkpick__head">選取一週</div>
          <div className="wkpick__list">
            {weeks.map((w, i) => (
              <button
                key={i}
                ref={i === currentWeek ? currentItemRef : null}
                className={`wkpick__item${i === currentWeek ? ' is-cur' : ''}`}
                role="option"
                aria-selected={i === currentWeek}
                onClick={() => { onSelect(i); setOpen(false); }}
              >
                <span>{getDateLabel(w)}</span>
                {i === currentWeek && <span className="wkpick__cur-tag">當週</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExportMenu({ week, getAssign, exportOpen, setExportOpen, menuRef }) {
  const handleExport = async (type) => {
    if (!week) return;
    setExportOpen(false);
    try {
      if (type === 'jpg') {
        await downloadWeekJpeg(week, getAssign);
      } else if (type === 'copy') {
        await copyWeekImageToClipboard(week, getAssign);
      } else if (type === 'xlsx') {
        await downloadWeekXlsx(week, getAssign);
      } else if (type === 'pdf' || type === 'print') {
        openWeekPrintWindow(week, getAssign);
      }
    } catch (error) {
      window.alert(error?.message || '匯出失敗');
    }
  };

  return (
    <div className="menuwrap" ref={menuRef}>
      <button
        className="btn btn--primary"
        onClick={(e) => { e.stopPropagation(); setExportOpen(o => !o); }}
      >
        匯出 <span className="caret">▾</span>
      </button>
      {exportOpen && (
        <div className="menu" onClick={(e) => e.stopPropagation()}>
          {EXPORT_ITEMS.map((item, i) =>
            item === null ? (
              <div key={i} className="menu__div" />
            ) : (
              <button
                key={i}
                type="button"
                className="menu__item"
                onClick={() => handleExport(item.action)}
              >
                <span className="menu__ic">{item.ic}</span>
                {item.label}
                {item.sub && <small>{item.sub}</small>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default function MeetingsPage({
  midweekWeeks,
  view, setView, week, setWeek,
  editMode, setEditMode, exportOpen, setExportOpen,
  weekendFilter, setWeekendFilter,
  getAssign, openSheet, updateMidweekWeek,
}) {
  const menuRef = useRef(null);

  useEffect(() => {
    if (!exportOpen) return;
    const handler = () => setExportOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [exportOpen, setExportOpen]);

  const totalWeeks = midweekWeeks.length;
  const prev = () => setWeek(w => (w - 1 + totalWeeks) % totalWeeks);
  const next = () => setWeek(w => (w + 1) % totalWeeks);

  const tabs = (
    <div className="tabs" role="tablist">
      <button className="tab" role="tab"
        aria-selected={view === 'midweek' ? 'true' : 'false'}
        onClick={() => setView('midweek')}>聚會</button>
      <button className="tab" role="tab"
        aria-selected={view === 'weekend' ? 'true' : 'false'}
        onClick={() => setView('weekend')}>週末</button>
    </div>
  );

  return (
    <section>
      {view === 'midweek' && (
        /* mw-container caps everything (toolbar + navstrip + card) at the same max-width */
        <div className="mw-container">
          <div className="toolbar">
            {tabs}
            <div className="toolbar__spacer" />
            <button
              className={`btn${editMode ? ' btn--primary' : ''}`}
              onClick={() => setEditMode(e => !e)}
            >
              <span className="pen">{editMode ? '✓' : '✎'}</span>
              <span>{editMode ? '完成' : '編輯'}</span>
            </button>
            <ExportMenu
              week={midweekWeeks[week]}
              getAssign={getAssign}
              exportOpen={exportOpen}
              setExportOpen={setExportOpen}
              menuRef={menuRef}
            />
          </div>

          {editMode && (
            <div className="edit-banner">
              <span className="pen">✎</span>
              編輯模式 — 可直接修改會議日期、時間、標題與時長。人名仍請用指派清單調整。
            </div>
          )}

          <div className="mw-navstrip">
            <button className="iconbtn" aria-label="上一週" onClick={prev}>‹</button>
            <WeekPicker weeks={midweekWeeks} currentWeek={week} onSelect={setWeek} />
            <button className="iconbtn" aria-label="下一週" onClick={next}>›</button>
          </div>

          <MidweekWeek
            week={midweekWeeks[week]}
            editMode={editMode}
            getAssign={getAssign}
            openSheet={openSheet}
            updateMidweekWeek={updateMidweekWeek}
          />
        </div>
      )}

      {view === 'weekend' && (
        <>
          <div className="toolbar">
            {tabs}
          </div>
          <WeekendView
            filter={weekendFilter}
            setFilter={setWeekendFilter}
            getAssign={getAssign}
            openSheet={openSheet}
          />
        </>
      )}
    </section>
  );
}
