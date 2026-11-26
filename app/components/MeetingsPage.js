'use client';
import { useEffect, useRef, useState } from 'react';
import MidweekWeek from './MidweekWeek';
import FitToScreen from './FitToScreen';
import WeekendView from './WeekendView';
import PrintStage from './PrintStage';
import {
  getMidweekExportFilename,
  downloadWeekXlsx,
  buildWeekText,
} from '../lib/midweekExport';
import { copyNodeImageToClipboard, downloadNodeImage, exportStagePdf } from '../lib/printPdf';
import { buildWeekendText, downloadWeekendXlsx, getWeekendExportFilename } from '../lib/weekendExport';
import { getToken } from '../lib/auth-context';
import {
  MIDWEEK_TYPES,
  MIDWEEK_TYPE_LABELS,
  isMidweekSuspended,
  suggestTypeFromLabel,
} from '../lib/weekType.mjs';

const EXPORT_ITEMS = [
  { ic: '▦', label: '匯出 JPG', sub: '貼到 LINE 群組', action: 'jpg' },
  { ic: '▭', label: '複製圖片到剪貼簿', action: 'copy' },
  { ic: '✎', label: '複製文字', sub: '手動貼到 LINE 群組', action: 'text' },
  null,
  { ic: '▤', label: '匯出 Excel', sub: '沿用原本表格格式', action: 'xlsx' },
  { ic: '▥', label: '下載 PDF', sub: '直接下載檔案', action: 'pdf' },
];

function getDateLabel(week) {
  if (!week) return '';
  if (week.dateLabel) return week.dateLabel;
  const m = week.date?.match(/(\d+)月\s*(\d+)日/);
  if (!m) return week.date ?? '';
  return `${m[1]}月${m[2]}-${parseInt(m[2]) + 6}日`;
}

export function WeekPicker({ weeks, currentWeek, onSelect }) {
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
        <span className="wkpick__label" data-testid="week-label">{getDateLabel(weeks[currentWeek])}</span>
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

export function ExportMenu({ week, getAssign, captureRef, pdfNodesRef, editMode = false, exportOpen, setExportOpen, menuRef }) {
  // JPG / 複製圖片 normally screenshot the live card, so a phone gets the card
  // it is looking at. In EDIT mode that card carries the edit bar, the 新增
  // ghosts and the inline inputs, which must never reach a picture pasted into
  // a LINE group — the stage's read-only card is the same week without them.
  const imageNode = () => (editMode ? pdfNodesRef?.current?.[0] : captureRef.current);
  const handleExport = async (type) => {
    if (!week) return;
    setExportOpen(false);
    try {
      if (type === 'jpg') {
        await downloadNodeImage(imageNode(), getMidweekExportFilename(week, 'jpg'));
      } else if (type === 'copy') {
        await copyNodeImageToClipboard(imageNode());
      } else if (type === 'xlsx') {
        await downloadWeekXlsx(week, getAssign);
      } else if (type === 'text') {
        const text = buildWeekText(week, getAssign);
        if (!navigator.clipboard?.writeText) throw new Error('目前瀏覽器不支援複製文字。');
        await navigator.clipboard.writeText(text);
        window.alert('已複製本週節目文字，可貼到 LINE 群組。');
      } else if (type === 'pdf') {
        // The PDF captures the off-screen PrintStage, never the live card: on a
        // phone the live card is the stacked layout and in edit mode it carries
        // edit controls. Generated client-side and downloaded directly — no
        // print dialog / popup (which browsers block).
        await exportStagePdf(pdfNodesRef?.current, {
          filename: getMidweekExportFilename(week, 'pdf'),
        });
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

const WEEKEND_EXPORT_ITEMS = [
  { ic: '▦', label: '匯出 JPG', sub: '貼到 LINE 群組', action: 'jpg' },
  { ic: '▭', label: '複製圖片到剪貼簿', action: 'copy' },
  { ic: '✎', label: '複製文字', sub: '手動貼到 LINE 群組', action: 'text' },
  null,
  { ic: '▤', label: '匯出 Excel', action: 'xlsx' },
  { ic: '▥', label: '下載 PDF', sub: '直接下載檔案', action: 'pdf' },
];

export function WeekendExportMenu({ getAssign, captureRef, visibleRowsRef, pdfNodesRef, editMode = false, exportOpen, setExportOpen, menuRef }) {
  const handleExport = async (type) => {
    setExportOpen(false);
    const rows = visibleRowsRef.current ?? [];
    try {
      if (type === 'text') {
        const text = buildWeekendText(rows, getAssign);
        if (!navigator.clipboard?.writeText) throw new Error('目前瀏覽器不支援複製文字。');
        await navigator.clipboard.writeText(text);
        window.alert('已複製週末安排文字，可貼到 LINE 群組。');
        return;
      }
      if (type === 'xlsx') {
        await downloadWeekendXlsx(rows, getAssign);
        return;
      }
      if (type === 'pdf') {
        // One PrintStage capture per page: the rows are rendered as page-sized
        // chunks with the header repeated, so a long table splits at row
        // boundaries instead of shrinking into illegibility.
        await exportStagePdf(pdfNodesRef?.current, {
          filename: getWeekendExportFilename(rows, 'pdf', '週末聚會'),
        });
        return;
      }
      // The live table is the phone's card list and, in edit mode, carries the
      // 編輯中 banner plus per-cell inputs. A chat image must never show those,
      // so edit mode shoots the read-only print stage instead.
      const node = editMode ? pdfNodesRef?.current?.[0] : captureRef.current;
      if (!node) throw new Error('沒有可匯出的內容。');
      if (type === 'jpg') {
        await downloadNodeImage(node, getWeekendExportFilename(rows, 'jpg', '週末聚會'));
      } else if (type === 'copy') {
        await copyNodeImageToClipboard(node);
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
          {WEEKEND_EXPORT_ITEMS.map((item, i) =>
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

/* The real 聚會 midweek chrome — toolbar, publish banner, navstrip and the
   edit-mode type bar — shared by MeetingsPage and the layout fixture so an iPad
   audit exercises the same JSX the app renders. Only the card/children differ. */
export function MidweekChrome({
  weeks, week, setWeek, view, setView, editMode, setEditMode,
  canEdit = true, publishResult, publishing, onPublish, onFinishEdit,
  exportOpen, setExportOpen, menuRef, captureRef, pdfNodesRef, getAssign,
  hasMwSuggestions = false, mwPrefix, acceptAllSuggestions, clearSuggestions,
  setPage, suggestingMw = false, setSuggestingMw, fetchMidweekSuggestions, onDeleteWeek, updateMidweekWeek,
  children,
}) {
  const prev = () => {
    if (mwPrefix) clearSuggestions?.(mwPrefix);
    setWeek((w) => (w - 1 + weeks.length) % weeks.length);
  };
  const next = () => {
    if (mwPrefix) clearSuggestions?.(mwPrefix);
    setWeek((w) => (w + 1) % weeks.length);
  };
  const tabs = (
    <div className="tabs" role="tablist">
      <button className="tab" role="tab"
        aria-selected={view === 'midweek' ? 'true' : 'false'}
        onClick={() => setView('midweek')}>週中</button>
      <button className="tab" role="tab"
        aria-selected={view === 'weekend' ? 'true' : 'false'}
        onClick={() => setView('weekend')}>週末</button>
    </div>
  );

  return (
    <div className="mw-container">
      <div className="toolbar" data-testid="week-toolbar">
        {tabs}
        <div className="toolbar__spacer" />
        {canEdit && (
          <button
            className={`btn${editMode ? ' btn--primary' : ''}`}
            onClick={() => { if (editMode) onFinishEdit(); else setEditMode(true); }}
          >
            <span className="pen">{editMode ? '✓' : '✎'}</span>
            <span>{editMode ? '完成' : '編輯'}</span>
          </button>
        )}
        <ExportMenu
          week={weeks[week]}
          getAssign={getAssign}
          captureRef={captureRef}
          pdfNodesRef={pdfNodesRef}
          editMode={editMode}
          exportOpen={exportOpen}
          setExportOpen={setExportOpen}
          menuRef={menuRef}
        />
        {canEdit && hasMwSuggestions && (
          <>
            <button className="btn btn--primary btn--sm" onClick={() => acceptAllSuggestions?.(mwPrefix)}>接受全部</button>
            <button className="btn btn--sm" onClick={() => clearSuggestions?.(mwPrefix)}>清除建議</button>
          </>
        )}
        {canEdit && weeks.length > 0 && (
          <button className="btn btn--notify" onClick={onPublish} disabled={publishing}>
            {publishing ? '發送中…' : '發布通知'}
          </button>
        )}
      </div>
      {publishResult && (
        <div className={`publish-banner${publishResult.error || publishResult.failed > 0 ? ' publish-banner--err' : ' publish-banner--ok'}`}>
          {publishResult.error
            ? `發送失敗：${publishResult.error}`
            : `已發送 ${publishResult.sent} / ${publishResult.total} 人${publishResult.failed > 0 ? `，${publishResult.failed} 人失敗` : ''}`}
        </div>
      )}

      {weeks.length === 0 ? (
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
          <div className="mw-navstrip" data-testid="week-bar">
            <button className="iconbtn" data-testid="week-prev" aria-label="上一週" onClick={prev}>‹</button>
            <WeekPicker weeks={weeks} currentWeek={week} onSelect={setWeek} />
            <button className="iconbtn" data-testid="week-next" aria-label="下一週" onClick={next}>›</button>
            {editMode && (
              <button
                className="iconbtn iconbtn--suggest"
                aria-label="自動建議"
                title="自動建議空缺"
                disabled={suggestingMw}
                onClick={async () => {
                  const w = weeks[week];
                  if (!w) return;
                  setSuggestingMw?.(true);
                  await fetchMidweekSuggestions?.(w.id);
                  setSuggestingMw?.(false);
                }}
              >{suggestingMw ? '…' : '✦'}</button>
            )}
            {editMode && (
              <button
                className="iconbtn iconbtn--danger"
                aria-label="刪除此週"
                title="刪除此週"
                onClick={async () => {
                  if (!window.confirm(`確定要刪除「${weeks[week]?.dateLabel || weeks[week]?.date}」？`)) return;
                  await onDeleteWeek?.(weeks[week]);
                }}
              >−</button>
            )}
          </div>
          {editMode && weeks[week] && (() => {
            const w = weeks[week];
            const wType = w.type ?? 'normal';
            const setType = (t) => updateMidweekWeek(w.id, (cur) => ({ ...cur, type: t, label: t === 'normal' ? '' : (cur.label ?? '') }));
            const setLabel = (v) => updateMidweekWeek(w.id, (cur) => {
              const suggested = (cur.type ?? 'normal') === 'normal' ? suggestTypeFromLabel(v) : null;
              return { ...cur, label: v, ...(suggested ? { type: suggested } : {}) };
            });
            const placeholder = isMidweekSuspended(w)
              ? '國際大會、區域大會、總部代表…'
              : '分區監督探訪、特別演講…';
            return (
              <div className="mw-type-bar">
                <div className="mw-type-chips">
                  {MIDWEEK_TYPES.map((val) => (
                    <button
                      key={val}
                      className={`mw-type-chip${wType === val ? ' mw-type-chip--active' : ''}`}
                      onClick={() => setType(val)}
                    >{MIDWEEK_TYPE_LABELS[val]}</button>
                  ))}
                </div>
                {wType !== 'normal' && (
                  <input
                    className="week-edit__input mw-type-label-input"
                    type="text"
                    placeholder={placeholder}
                    value={w.label ?? ''}
                    onChange={(e) => setLabel(e.target.value)}
                    aria-label="週次標籤"
                  />
                )}
              </div>
            );
          })()}
          {children}
        </>
      )}
    </div>
  );
}

export default function MeetingsPage({
  midweekWeeks,
  view, setView, week, setWeek,
  editMode, setEditMode, exportOpen, setExportOpen,
  weekendFilter, setWeekendFilter, weekendRows,
  weekendEditMode, setWeekendEditMode, weekendExportOpen, setWeekendExportOpen,
  addWeekendRow, deleteWeekendRow, updateWeekendRow, persistWeekendField,
  getAssign, openSheet, updateMidweekWeek, saveMidweekWeek, addMidweekPart, deleteMidweekPart, deleteMidweekWeek, clearSlot, setPage,
  getSuggestion, onAccept, onClear,
  suggestions = {}, fetchMidweekSuggestions, acceptAllSuggestions, clearSuggestions,
  fetchWeekendSuggestions, canEdit = true,
}) {
  const menuRef = useRef(null);
  const captureRef = useRef(null);
  const midweekPdfNodesRef = useRef([]);
  const weekendMenuRef = useRef(null);
  const weekendCaptureRef = useRef(null);
  const weekendVisibleRowsRef = useRef([]);
  const weekendPdfNodesRef = useRef([]);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null); // { sent, failed, total } | { error }
  const [suggestingMw, setSuggestingMw] = useState(false);

  async function handlePublish() {
    if (!window.confirm('確定要發送 LINE 通知給所有已設定 LINE ID 的成員嗎？')) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const token = await getToken();
      const res = await fetch('/api/meetings/publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPublishResult(data);
    } catch (err) {
      setPublishResult({ error: err.message });
    } finally {
      setPublishing(false);
      setTimeout(() => setPublishResult(null), 6000);
    }
  }

  useEffect(() => {
    if (!exportOpen) return;
    const handler = () => setExportOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [exportOpen, setExportOpen]);

  useEffect(() => {
    if (!weekendExportOpen) return;
    const handler = () => setWeekendExportOpen?.(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [weekendExportOpen, setWeekendExportOpen]);

  const totalWeeks = midweekWeeks.length;
  const currentWeekId = midweekWeeks[week]?.id;
  const mwPrefix = currentWeekId ? `mw${currentWeekId}_` : null;
  const hasMwSuggestions = mwPrefix && Object.keys(suggestions).some(k => k.startsWith(mwPrefix));
  const hasWeSuggestions = Object.keys(suggestions).some(k => k.startsWith('we'));

  const prev = () => {
    if (mwPrefix) clearSuggestions?.(mwPrefix);
    setWeek(w => (w - 1 + totalWeeks) % totalWeeks);
  };
  const next = () => {
    if (mwPrefix) clearSuggestions?.(mwPrefix);
    setWeek(w => (w + 1) % totalWeeks);
  };

  // Single exit path so the toolbar button and the card's inline 「完成」 bar
  // both save the current draft before leaving edit mode.
  function finishEdit() {
    if (!editMode) return;
    if (midweekWeeks[week]) saveMidweekWeek(midweekWeeks[week]);
    if (mwPrefix) clearSuggestions?.(mwPrefix);
    setEditMode(false);
  }

  const tabs = (
    <div className="tabs" role="tablist">
      <button className="tab" role="tab"
        aria-selected={view === 'midweek' ? 'true' : 'false'}
        onClick={() => setView('midweek')}>週中</button>
      <button className="tab" role="tab"
        aria-selected={view === 'weekend' ? 'true' : 'false'}
        onClick={() => setView('weekend')}>週末</button>
    </div>
  );

  return (
    <section>
      {view === 'midweek' && (
        /* mw-container caps everything (toolbar + navstrip + card) at the same max-width */
        <MidweekChrome
          weeks={midweekWeeks} week={week} setWeek={setWeek} view={view} setView={setView}
          editMode={editMode} setEditMode={setEditMode} canEdit={canEdit}
          publishResult={publishResult} publishing={publishing} onPublish={handlePublish}
          onFinishEdit={finishEdit}
          exportOpen={exportOpen} setExportOpen={setExportOpen} menuRef={menuRef}
          captureRef={captureRef} pdfNodesRef={midweekPdfNodesRef} getAssign={getAssign}
          hasMwSuggestions={hasMwSuggestions} mwPrefix={mwPrefix}
          acceptAllSuggestions={acceptAllSuggestions} clearSuggestions={clearSuggestions}
          setPage={setPage} suggestingMw={suggestingMw} setSuggestingMw={setSuggestingMw}
          fetchMidweekSuggestions={fetchMidweekSuggestions}
          onDeleteWeek={async (w) => { setEditMode(false); await deleteMidweekWeek(w.id); }}
          updateMidweekWeek={updateMidweekWeek}
        >
              <FitToScreen>
                <MidweekWeek
                  week={midweekWeeks[week]}
                  editMode={editMode}
                  getAssign={getAssign}
                  openSheet={openSheet}
                  updateMidweekWeek={updateMidweekWeek}
                  addMidweekPart={addMidweekPart}
                  deleteMidweekPart={deleteMidweekPart}
                  cardRef={captureRef}
                  getSuggestion={getSuggestion}
                  onAccept={onAccept}
                  onClear={onClear}
                  clearSlot={clearSlot}
                  onFinishEdit={finishEdit}
                />
              </FitToScreen>
              {/* The PDF capture: a read-only copy of THIS week at print width,
                  so a phone PDF is the desktop card and an edit-mode PDF
                  carries no edit controls. JPG / 複製圖片 use it too in edit
                  mode (see ExportMenu's imageNode); in read mode they keep the
                  live card so a phone gets the layout it is looking at. */}
              <PrintStage nodesRef={midweekPdfNodesRef}>
                {midweekWeeks[week] && (
                  <MidweekWeek
                    week={midweekWeeks[week]}
                    editMode={false}
                    getAssign={getAssign}
                    openSheet={() => {}}
                    updateMidweekWeek={() => {}}
                  />
                )}
              </PrintStage>
        </MidweekChrome>
      )}
      {view === 'weekend' && (
        <div className="mw-container">
          <div className="toolbar">
            {tabs}
            <div className="toolbar__spacer" />
            {canEdit && (
              <button
                className={`btn${weekendEditMode ? ' btn--primary' : ''}`}
                onClick={() => {
                  if (weekendEditMode) clearSuggestions?.('we');
                  setWeekendEditMode(e => !e);
                }}
              >
                <span className="pen">{weekendEditMode ? '✓' : '✎'}</span>
                <span>{weekendEditMode ? '完成' : '編輯'}</span>
              </button>
            )}
            <WeekendExportMenu
              getAssign={getAssign}
              captureRef={weekendCaptureRef}
              visibleRowsRef={weekendVisibleRowsRef}
              pdfNodesRef={weekendPdfNodesRef}
              editMode={weekendEditMode}
              exportOpen={weekendExportOpen}
              setExportOpen={setWeekendExportOpen}
              menuRef={weekendMenuRef}
            />
            {canEdit && hasWeSuggestions && (
              <>
                <button className="btn btn--primary btn--sm" onClick={() => acceptAllSuggestions?.('we')}>接受全部</button>
                <button className="btn btn--sm" onClick={() => clearSuggestions?.('we')}>清除建議</button>
              </>
            )}
            {canEdit && (
              <button className="btn btn--notify" onClick={handlePublish} disabled={publishing}>
                {publishing ? '發送中…' : '發布通知'}
              </button>
            )}
          </div>
          {publishResult && (
            <div className={`publish-banner${publishResult.error || publishResult.failed > 0 ? ' publish-banner--err' : ' publish-banner--ok'}`}>
              {publishResult.error
                ? `發送失敗：${publishResult.error}`
                : `已發送 ${publishResult.sent} / ${publishResult.total} 人${publishResult.failed > 0 ? `，${publishResult.failed} 人失敗` : ''}`}
            </div>
          )}
          {weekendEditMode && (
            <div className="edit-banner">
              <span className="pen">✎</span>
              編輯模式 — 可直接修改日期、主題、會眾等欄位，並新增或刪除列。
            </div>
          )}
          <WeekendView
            filter={weekendFilter}
            setFilter={setWeekendFilter}
            weekendRows={weekendRows}
            getAssign={getAssign}
            openSheet={openSheet}
            editMode={weekendEditMode}
            updateRow={(rowId, field, value) => {
              updateWeekendRow(rowId, field, value);
              persistWeekendField(rowId, field, value);
            }}
            deleteRow={deleteWeekendRow}
            addRow={addWeekendRow}
            getSuggestion={getSuggestion}
            onAccept={onAccept}
            onClear={onClear}
            fetchWeekendSuggestions={fetchWeekendSuggestions}
            captureRef={weekendCaptureRef}
            visibleRowsRef={weekendVisibleRowsRef}
            printNodesRef={weekendPdfNodesRef}
          />
        </div>
      )}
    </section>
  );
}
