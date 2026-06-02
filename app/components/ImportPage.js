'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { parseEpub } from '../lib/epubParser';
import MidweekWeek from './MidweekWeek';
import {
  exportNodesJpeg,
  exportNodesPdf,
  exportWeeksXlsx,
  openNodesPrintWindow,
} from '../lib/midweekExport';

const SECTION_LABELS = {
  treasures: { label: '上帝話語的寶藏', color: 'treasures' },
  ministry:  { label: '用心準備傳道工作', color: 'ministry' },
  living:    { label: '基督徒的生活', color: 'living' },
};

const CAT_LABELS = {
  treasures: '寶藏演講', gems: '經文寶石', reading: '經文朗讀',
  ministry: '傳道示範', assistant:'助手', living: '生活演講', cbs: '研經班',
};

const EXPORT_CARDS = [
  { ic: '▦', label: '分享圖片', sub: 'JPG · 貼到 LINE 群組', action: 'jpg' },
  { ic: '▤', label: '匯出 Excel', sub: '沿用原本表格格式', action: 'xlsx' },
  { ic: '▥', label: '下載 PDF', sub: '直接下載檔案', action: 'pdf' },
  { ic: '⎙', label: '列印', sub: '直接送印表機', action: 'print' },
];

function weekDateKey(week) {
  const m = String(week?.date ?? '').match(/(\d+)月\s*(\d+)日/);
  return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0;
}
function weekMonth(week) {
  const m = String(week?.date ?? '').match(/(\d+)月/);
  return m ? parseInt(m[1]) : 0;
}

function WeekReviewCard({ week, idx }) {
  const [open, setOpen] = useState(idx === 0);
  const total = week.treasures.length + week.ministry.length + week.living.length;

  return (
    <div className="rvc">
      <button className="rvc__head" onClick={() => setOpen(o => !o)}>
        <span className="rvc__arrow">{open ? '▾' : '▸'}</span>
        <span className="rvc__date">{week.date}</span>
        <span className="rvc__reading">{week.reading}</span>
        <span className="rvc__meta">
          {total} 項 · 詩歌 {week.openSong}/{week.midSong}/{week.closeSong}
        </span>
      </button>

      {open && (
        <div className="rvc__body">
          {(['treasures', 'ministry', 'living']).map(sec => {
            const parts = week[sec];
            if (!parts.length) return null;
            const { label, color } = SECTION_LABELS[sec];
            return (
              <div key={sec} className="rvc__section">
                <div className={`rvc__sec-head rvc__sec-head--${color}`}>{label}</div>
                {parts.map((p, i) => (
                  <div key={i} className="rvc__part">
                    <span className="rvc__part-num">{p.partNum}.</span>
                    <span className="rvc__part-title">{p.title}</span>
                    <span className="rvc__part-meta">
                      {CAT_LABELS[p.cat] ?? p.cat} · {p.dur}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DAY_NAMES = ['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];

const DAY_SHORT = ['一','二','三','四','五','六','日'];

function addException(settings) {
  const exc = { id: Date.now(), fromMonth: 1, fromDay: 1, toMonth: 12, toDay: 31, dayOffset: settings.dayOffset, time: settings.time };
  return { ...settings, exceptions: [...(settings.exceptions ?? []), exc] };
}
function updateException(settings, id, patch) {
  return { ...settings, exceptions: settings.exceptions.map(e => e.id === id ? { ...e, ...patch } : e) };
}
function removeException(settings, id) {
  return { ...settings, exceptions: settings.exceptions.filter(e => e.id !== id) };
}

export default function ImportPage({ onImportWeeks, onResetWeeks, onReapplySchedule, existingWeeks = [], getAssign, congSettings = { dayOffset: 2, time: '19:30', exceptions: [] }, setCongSettings }) {
  const [stage, setStage] = useState('upload'); // upload | parsing | review | done
  const [parsedWeeks, setParsedWeeks] = useState([]);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  // Export range
  const [range, setRange] = useState('all'); // all | month | custom
  const [customFrom, setCustomFrom] = useState({ m: 1, d: 1 });
  const [customTo, setCustomTo] = useState({ m: 12, d: 31 });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const cardRefs = useRef([]); // rendered (off-screen) MidweekWeek cards, one per selected week

  const selectedWeeks = useMemo(() => {
    if (range === 'month') {
      const mk = new Date().getMonth() + 1;
      return existingWeeks.filter((w) => weekMonth(w) === mk);
    }
    if (range === 'custom') {
      const from = customFrom.m * 100 + customFrom.d;
      const to = customTo.m * 100 + customTo.d;
      return existingWeeks.filter((w) => {
        const k = weekDateKey(w);
        return k >= from && k <= to;
      });
    }
    return existingWeeks;
  }, [range, existingWeeks, customFrom, customTo]);

  const runExport = useCallback(async (action) => {
    if (!selectedWeeks.length) { setExportError('所選範圍沒有可匯出的週次。'); return; }
    setExportError(null);
    setExporting(true);
    try {
      const nodes = cardRefs.current.slice(0, selectedWeeks.length).filter(Boolean);
      if (action === 'jpg') await exportNodesJpeg(nodes, selectedWeeks);
      else if (action === 'xlsx') await exportWeeksXlsx(selectedWeeks, getAssign);
      else if (action === 'pdf') await exportNodesPdf(nodes, selectedWeeks);
      else if (action === 'print') await openNodesPrintWindow(nodes);
    } catch (err) {
      setExportError(err?.message || '匯出失敗');
    } finally {
      setExporting(false);
    }
  }, [selectedWeeks, getAssign]);

  const existingDates = new Set(existingWeeks.map((w) => w.date));
  const mergeStats = {
    update: parsedWeeks.filter((w) => existingDates.has(w.date)).length,
    add: parsedWeeks.filter((w) => !existingDates.has(w.date)).length,
  };

  const processFile = useCallback(async (file) => {
    if (!file) return;
    if (!file.name.endsWith('.epub')) {
      setError('請選擇 .epub 格式的聚會手冊檔案');
      return;
    }
    setError(null);
    setStage('parsing');
    try {
      const weeks = await parseEpub(file);
      setParsedWeeks(weeks);
      setStage('review');
    } catch (e) {
      setError(e.message ?? '解析失敗，請確認檔案格式正確');
      setStage('upload');
    }
  }, []);

  const onFileChange = (e) => {
    processFile(e.target.files?.[0]);
    e.target.value = '';
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  const handleConfirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await onImportWeeks?.(parsedWeeks);
      setStage('done');
    } catch (err) {
      setError(err.message ?? '匯入失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStage('upload');
    setParsedWeeks([]);
    setError(null);
  };

  return (
    <section>
      <div className="toolbar">
        <span className="toolbar__title">匯入 / 匯出</span>
        {stage === 'review' && (
          <button className="btn" onClick={handleReset}>重新上傳</button>
        )}
      </div>

      {/* ── UPLOAD / PARSING ── */}
      {(stage === 'upload' || stage === 'parsing') && (
        <div className="imp-grid">
          <div className="imp-col">
            <h3 className="imp-h">匯入聚會手冊 EPUB</h3>
            <div
              className={`dropzone${dragging ? ' dropzone--active' : ''}`}
              onClick={() => stage === 'upload' && fileInputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".epub"
                style={{ display: 'none' }}
                onChange={onFileChange}
              />
              {stage === 'parsing' ? (
                <>
                  <div className="dropzone__ic spin">⟳</div>
                  <div className="dropzone__t">解析中，請稍候…</div>
                  <div className="dropzone__sub">正在讀取聚會手冊節目</div>
                </>
              ) : (
                <>
                  <div className="dropzone__ic">⬆</div>
                  <div className="dropzone__t">拖曳 EPUB 到這裡，或<u>點擊選擇</u></div>
                  <div className="dropzone__sub">
                    支援 JW.org 聚會手冊 EPUB（mwb_CH_*.epub）
                  </div>
                </>
              )}
            </div>

            {error && <div className="imp-error">{error}</div>}

            <div className="imp-hint">
              <div className="imp-hint__title">如何取得 EPUB？</div>
              <ol className="imp-hint__steps">
                <li>前往 JW.org → 出版物 → 傳道與生活聚會手冊</li>
                <li>選擇中文（繁體）語言</li>
                <li>下載 EPUB 格式（每兩個月一期）</li>
                <li>將下載的 .epub 檔案上傳到這裡</li>
              </ol>
            </div>
          </div>

          <div className="imp-col">
            <h3 className="imp-h">會眾聚會設定</h3>
            <div className="cong-settings">
              <div className="cong-settings__label">預設平日聚會</div>
              <div className="cong-settings__row">
                <div className="cong-settings__days">
                  {DAY_SHORT.map((name, i) => (
                    <button key={i}
                      className={`cong-day-btn${congSettings.dayOffset === i ? ' is-active' : ''}`}
                      onClick={() => setCongSettings(s => ({ ...s, dayOffset: i }))}>
                      {name}
                    </button>
                  ))}
                </div>
                <input className="cong-settings__time" type="time"
                  value={congSettings.time}
                  onChange={e => setCongSettings(s => ({ ...s, time: e.target.value }))} />
              </div>

              {/* Exception periods */}
              {(congSettings.exceptions ?? []).length > 0 && (
                <div className="cong-exc-list">
                  {congSettings.exceptions.map(exc => (
                    <div key={exc.id} className="cong-exc">
                      <span className="cong-exc__label">從</span>
                      <input className="cong-exc__num" type="number" min="1" max="12" value={exc.fromMonth}
                        onChange={e => setCongSettings(s => updateException(s, exc.id, { fromMonth: +e.target.value }))} />
                      <span className="cong-exc__label">月</span>
                      <input className="cong-exc__num" type="number" min="1" max="31" value={exc.fromDay}
                        onChange={e => setCongSettings(s => updateException(s, exc.id, { fromDay: +e.target.value }))} />
                      <span className="cong-exc__label">日 至</span>
                      <input className="cong-exc__num" type="number" min="1" max="12" value={exc.toMonth}
                        onChange={e => setCongSettings(s => updateException(s, exc.id, { toMonth: +e.target.value }))} />
                      <span className="cong-exc__label">月</span>
                      <input className="cong-exc__num" type="number" min="1" max="31" value={exc.toDay}
                        onChange={e => setCongSettings(s => updateException(s, exc.id, { toDay: +e.target.value }))} />
                      <span className="cong-exc__label">日 改為</span>
                      <div className="cong-settings__days cong-settings__days--sm">
                        {DAY_SHORT.map((name, i) => (
                          <button key={i}
                            className={`cong-day-btn cong-day-btn--sm${exc.dayOffset === i ? ' is-active' : ''}`}
                            onClick={() => setCongSettings(s => updateException(s, exc.id, { dayOffset: i }))}>
                            {name}
                          </button>
                        ))}
                      </div>
                      <input className="cong-settings__time" type="time" value={exc.time}
                        onChange={e => setCongSettings(s => updateException(s, exc.id, { time: e.target.value }))} />
                      <button className="cong-exc__del" onClick={() => setCongSettings(s => removeException(s, exc.id))}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="cong-settings__actions">
                <button className="btn btn--ghost" onClick={() => setCongSettings(s => addException(s))}>
                  + 新增例外期間
                </button>
                {onReapplySchedule && existingWeeks.some(w => w.weekStart) && (
                  <button className="btn btn--ghost" onClick={onReapplySchedule}>
                    重新套用至所有週次
                  </button>
                )}
              </div>
            </div>

            <h3 className="imp-h" style={{ marginTop: 20 }}>匯出與分享</h3>
            <div className="exp-range">
              <div className="exp-range__row">
                <span className="cong-settings__label">範圍</span>
                <div className="chips" role="group">
                  {[['all', '全部'], ['month', '本月'], ['custom', '自訂']].map(([k, label]) => (
                    <button
                      key={k}
                      className="chip"
                      aria-pressed={range === k ? 'true' : 'false'}
                      onClick={() => setRange(k)}
                    >{label}</button>
                  ))}
                </div>
                <span className="exp-range__count">已選 {selectedWeeks.length} 週</span>
              </div>
              {range === 'custom' && (
                <div className="cong-exc" style={{ marginTop: 8 }}>
                  <span className="cong-exc__label">從</span>
                  <input className="cong-exc__num" type="number" min="1" max="12" value={customFrom.m}
                    onChange={(e) => setCustomFrom((s) => ({ ...s, m: +e.target.value }))} />
                  <span className="cong-exc__label">月</span>
                  <input className="cong-exc__num" type="number" min="1" max="31" value={customFrom.d}
                    onChange={(e) => setCustomFrom((s) => ({ ...s, d: +e.target.value }))} />
                  <span className="cong-exc__label">日 至</span>
                  <input className="cong-exc__num" type="number" min="1" max="12" value={customTo.m}
                    onChange={(e) => setCustomTo((s) => ({ ...s, m: +e.target.value }))} />
                  <span className="cong-exc__label">月</span>
                  <input className="cong-exc__num" type="number" min="1" max="31" value={customTo.d}
                    onChange={(e) => setCustomTo((s) => ({ ...s, d: +e.target.value }))} />
                  <span className="cong-exc__label">日</span>
                </div>
              )}
            </div>
            {exportError && <div className="imp-error" style={{ marginTop: 10 }}>{exportError}</div>}
            <div className="exp-grid">
              {EXPORT_CARDS.map((c) => (
                <button
                  key={c.action}
                  className="exp-card"
                  disabled={exporting || selectedWeeks.length === 0}
                  onClick={() => runExport(c.action)}
                >
                  <span className="exp-ic">{c.ic}</span>
                  <b>{c.label}</b>
                  <small>{c.sub}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── REVIEW ── */}
      {stage === 'review' && (
        <div className="rev-stage">
          <div className="rev-stage__bar">
            <div>
              <div className="rev-stage__title">
                解析完成 — 找到 {parsedWeeks.length} 週節目
              </div>
              <div className="rev-stage__sub">
                {mergeStats.update > 0 && <span>更新 {mergeStats.update} 週</span>}
                {mergeStats.update > 0 && mergeStats.add > 0 && <span>　·　</span>}
                {mergeStats.add > 0 && <span>新增 {mergeStats.add} 週</span>}
                {mergeStats.update === 0 && mergeStats.add === 0 && <span>請確認節目內容正確，然後點選「匯入」套用至編排系統</span>}
              </div>
            </div>
            <div className="rev-stage__acts">
              <button className="btn" onClick={handleReset}>取消</button>
              <button className="btn btn--primary" onClick={handleConfirm} disabled={saving}>
                {saving ? '儲存中…' : `匯入 ${parsedWeeks.length} 週`}
              </button>
            </div>
          </div>

          {error && <div className="imp-error">{error}</div>}

          <div className="rvc-list">
            {parsedWeeks.map((week, i) => (
              <WeekReviewCard key={i} week={week} idx={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {stage === 'done' && (
        <div className="imp-done">
          <div className="imp-done__ic">✓</div>
          <div className="imp-done__title">匯入成功！</div>
          <div className="imp-done__sub">
            {mergeStats.update > 0 && `更新 ${mergeStats.update} 週、`}
            {`新增 ${mergeStats.add} 週節目。可繼續上傳其他期手冊，資料會自動合併。`}
          </div>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={handleReset}>再次匯入</button>
            {onResetWeeks && (
              <button className="btn" onClick={() => { onResetWeeks(); handleReset(); }}>
                重置為示範資料
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── RESET FOOTER (always visible on upload screen) ── */}
      {stage === 'upload' && onResetWeeks && existingWeeks.length > 0 && (
        <div className="imp-reset-row">
          <button className="btn btn--ghost" onClick={() => { onResetWeeks(); }}>
            重置為示範資料
          </button>
          <span className="imp-reset-label">目前已載入 {existingWeeks.length} 週</span>
        </div>
      )}

      {/* Off-screen real cards used as the source for JPG/PDF/列印 exports, so the
          output matches the live card exactly (no hand-redrawn canvas drift). */}
      <div aria-hidden="true" style={{ position: 'fixed', left: '-99999px', top: 0, width: 960, pointerEvents: 'none' }}>
        {selectedWeeks.map((w, i) => (
          <MidweekWeek
            key={w.id ?? i}
            week={w}
            editMode={false}
            getAssign={getAssign}
            openSheet={() => {}}
            updateMidweekWeek={() => {}}
            cardRef={(el) => { cardRefs.current[i] = el; }}
          />
        ))}
      </div>
    </section>
  );
}
