'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  MAX_BOXES,
  addBox,
  normalizeLayout,
  paginate,
  removeBox,
} from '../lib/pdfLayout.mjs';
import { isMidweekSuspended } from '../lib/weekType.mjs';

// The 版面 picker: choose how many week cards share one A4 page.
//
// Reuses the AssignSheet pattern (.sheet-backdrop / .sheet) rather than adding a
// second modal primitive, so it is a bottom sheet on a phone and a centred
// dialog from 721px up, with the same backdrop-tap and Escape behaviour.

// A Word-style rows × cols picker. Combinations above MAX_BOXES are shown but
// disabled, so the four-box cap is visible rather than a surprise.
const PICKER_MAX = 4;

function GridPicker({ layout, onPick }) {
  const [hover, setHover] = useState(null);
  const shown = hover ?? layout;

  return (
    <div
      className="pdflay-picker"
      onPointerLeave={() => setHover(null)}
      role="group"
      aria-label="選擇每頁的列數與欄數"
    >
      {Array.from({ length: PICKER_MAX }, (_, r) => (
        <div className="pdflay-picker__row" key={r}>
          {Array.from({ length: PICKER_MAX }, (_, c) => {
            const rows = r + 1;
            const cols = c + 1;
            const allowed = rows * cols <= MAX_BOXES;
            const on = allowed && rows <= shown.rows && cols <= shown.cols;
            return (
              <button
                key={c}
                type="button"
                className={`pdflay-picker__cell${on ? ' is-on' : ''}`}
                disabled={!allowed}
                aria-label={`${rows} 列 ${cols} 欄`}
                aria-pressed={rows === layout.rows && cols === layout.cols ? 'true' : 'false'}
                // Hover only previews; the tap that fires both on a touchscreen
                // simply previews then commits the same cell, so no gating.
                onPointerEnter={() => allowed && setHover({ rows, cols })}
                onClick={() => allowed && onPick(normalizeLayout({ rows, cols, count: rows * cols }))}
              />
            );
          })}
        </div>
      ))}
      <div className="pdflay-picker__cap" aria-live="polite">
        {shown.rows} × {shown.cols}
      </div>
    </div>
  );
}

// An A4-proportioned skeleton of one page: the first `count` boxes are filled,
// the rest of the grid stays as dashed ghosts.
function PagePreview({ layout }) {
  const cells = Array.from({ length: layout.rows * layout.cols }, (_, i) => i < layout.count);
  return (
    <div
      className="pdflay-page"
      style={{ gridTemplateRows: `repeat(${layout.rows}, 1fr)`, gridTemplateColumns: `repeat(${layout.cols}, 1fr)` }}
      aria-hidden="true"
    >
      {cells.map((filled, i) => (
        <div key={i} className={`pdflay-box${filled ? ' is-on' : ''}`}>
          {filled && (
            <>
              <span className="pdflay-box__head" />
              <span className="pdflay-box__line" />
              <span className="pdflay-box__line" />
              <span className="pdflay-box__line pdflay-box__line--short" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

export default function PdfLayoutSheet({ open, onClose, weeks, layout, onChange, onExport, exporting, error }) {
  const safe = useMemo(() => normalizeLayout(layout), [layout]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const pages = useMemo(
    () => (open ? paginate(weeks, safe, isMidweekSuspended).length : 0),
    [open, weeks, safe],
  );
  const suspendedCount = useMemo(
    () => (weeks ?? []).filter(isMidweekSuspended).length,
    [weeks],
  );

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop open"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="sheet sheet--pdflay" role="dialog" aria-modal="true" aria-label="PDF 版面">
        <div className="sheet__grab" />
        <header className="sheet__head">
          <div className="sheet__heads">
            <div className="sheet__role">PDF 版面</div>
            <div className="sheet__ctx">每頁要放幾週？共 {weeks?.length ?? 0} 週</div>
          </div>
          <button className="sheet__close" aria-label="關閉" onClick={onClose}>✕</button>
        </header>

        <div className="pdflay-body">
          <PagePreview layout={safe} />

          <div className="pdflay-controls">
            <GridPicker layout={safe} onPick={onChange} />

            <div className="pdflay-steps">
              <button
                type="button"
                className="btn btn--ghost btn--sm pdflay-step"
                aria-label="減少一格"
                disabled={safe.count <= 1}
                onClick={() => onChange(removeBox(safe))}
              >−</button>
              <b className="pdflay-steps__count">每頁 {safe.count} 週</b>
              <button
                type="button"
                className="btn btn--ghost btn--sm pdflay-step"
                aria-label="增加一格"
                disabled={safe.count >= MAX_BOXES}
                onClick={() => onChange(addBox(safe))}
              >＋</button>
            </div>

            <p className="pdflay-note">
              共 {pages} 頁
              {suspendedCount > 0 && `　·　${suspendedCount} 個暫停週以整頁寬提示列顯示，不佔格`}
            </p>
            {/* The page's own error line sits behind this sheet, so a failed
                export has to report itself here or it is invisible. */}
            {error && <p className="imp-error pdflay-error">{error}</p>}
          </div>
        </div>

        <div className="sheet__foot pdflay-foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>取消</button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={exporting || !(weeks?.length)}
            onClick={() => onExport(safe)}
          >
            {exporting ? '產生中…' : '下載 PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
