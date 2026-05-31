'use client';

import { useState, useRef, useCallback } from 'react';
import { parseEpub } from '../lib/epubParser';

const SECTION_LABELS = {
  treasures: { label: '上帝話語的寶藏', color: 'treasures' },
  ministry:  { label: '用心準備傳道工作', color: 'ministry' },
  living:    { label: '基督徒的生活', color: 'living' },
};

const CAT_LABELS = {
  treasures: '寶藏演講', gems: '屬靈寶石', reading: '經文朗讀',
  ministry: '傳道示範', living: '生活演講', cbs: '研經班',
};

const EXPORT_CARDS = [
  { ic: '▦', label: '分享圖片', sub: 'JPG · 貼到 LINE 群組' },
  { ic: '▤', label: '匯出 Excel', sub: '沿用原本表格格式' },
  { ic: '▥', label: '匯出 PDF', sub: '列印用排版' },
  { ic: '⎙', label: '列印', sub: '直接送印表機' },
];

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

export default function ImportPage({ onImportWeeks, onResetWeeks, existingWeeks = [] }) {
  const [stage, setStage] = useState('upload'); // upload | parsing | review | done
  const [parsedWeeks, setParsedWeeks] = useState([]);
  const [error, setError] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);

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

  const handleConfirm = () => {
    onImportWeeks?.(parsedWeeks);
    setStage('done');
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
            <h3 className="imp-h">匯出與分享</h3>
            <div className="exp-grid">
              {EXPORT_CARDS.map((c, i) => (
                <button key={i} className="exp-card">
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
              <button className="btn btn--primary" onClick={handleConfirm}>
                匯入 {parsedWeeks.length} 週
              </button>
            </div>
          </div>

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
    </section>
  );
}
