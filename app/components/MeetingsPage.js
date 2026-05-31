'use client';
import { useEffect, useRef, useState } from 'react';
import MidweekWeek from './MidweekWeek';
import WeekendView from './WeekendView';
import {
  getMidweekExportFilename,
  downloadWeekXlsx,
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

function ExportMenu({ week, getAssign, captureRef, exportOpen, setExportOpen, menuRef }) {
  const handleExport = async (type) => {
    if (!week) return;
    setExportOpen(false);
    try {
      const captureOpts = { pixelRatio: 2, skipFonts: false };
      if (type === 'jpg') {
        const { toJpeg } = await import('html-to-image');
        const dataUrl = await toJpeg(captureRef.current, { ...captureOpts, quality: 0.95 });
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = getMidweekExportFilename(week, 'jpg');
        a.click();
      } else if (type === 'copy') {
        if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
          throw new Error('目前瀏覽器不支援圖片剪貼簿。');
        }
        const { toPng } = await import('html-to-image');
        const dataUrl = await toPng(captureRef.current, captureOpts);
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      } else if (type === 'xlsx') {
        await downloadWeekXlsx(week, getAssign);
      } else if (type === 'pdf' || type === 'print') {
        const { toPng } = await import('html-to-image');
        const dataUrl = await toPng(captureRef.current, { pixelRatio: 2, skipFonts: false });
        const popup = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=900');
        if (!popup) throw new Error('瀏覽器阻擋了列印視窗。');
        popup.document.write(`<!doctype html><html><head><meta charset="utf-8">
          <title>${getMidweekExportFilename(week, 'pdf')}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background: #ecebe7; display: flex; justify-content: center; padding: 24px; }
            img { max-width: 100%; height: auto; border-radius: 18px; box-shadow: 0 8px 30px rgba(0,0,0,.12); }
            @media print { body { background: #ecebe7; padding: 0; } img { border-radius: 0; box-shadow: none; max-width: 100%; } }
          </style>
        </head><body>
          <img src="${dataUrl}" />
          <script>window.addEventListener('load', () => setTimeout(() => window.print(), 200));<\/script>
        </body></html>`);
        popup.document.close();
        popup.focus();
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
  getAssign, openSheet, updateMidweekWeek, setPage,
}) {
  const menuRef = useRef(null);
  const captureRef = useRef(null);

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
              captureRef={captureRef}
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

          {midweekWeeks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__ic">📂</div>
              <div className="empty-state__title">尚未匯入任何週次</div>
              <div className="empty-state__sub">前往「匯入 / 匯出」上傳聚會手冊 EPUB 即可開始編排</div>
              <button className="btn btn--primary" onClick={() => setPage?.('import')}>
                前往匯入
              </button>
            </div>
          ) : (
            <>
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
                cardRef={captureRef}
              />
            </>
          )}
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
