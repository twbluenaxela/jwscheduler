'use client';

// Extracted re-import confirmation dialog. Logic lives in ImportPage; this
// component is purely presentational so it can be rendered by the dev fixture.

export default function ReimportDialog({
  open,
  diffs = [],
  mode = 'keep',
  onModeChange,
  onCancel,
  onConfirm,
  saving = false,
}) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop open reimport-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onCancel?.(); }}>
      <div className="sheet reimport-sheet" role="dialog" aria-modal="true">
        <div className="sheet__grab" />
        <header className="sheet__head">
          <div className="sheet__heads">
            <div className="sheet__role">這些週次已經在資料庫中</div>
          </div>
          <button className="sheet__close" aria-label="關閉" onClick={onCancel}>✕</button>
        </header>
        <div className="reimport-body">
          <div className="reimport-weeks">
            {diffs.map((d, i) => {
              const isNew = d.isNew;
              const line = d.line;
              const unchanged = !isNew && d.diff && !d.diff.hasChanges;
              const newTag = isNew;
              return (
                <div key={i} className="reimport-week">
                  <span className="reimport-week__date">{line.split('：')[0]}</span>
                  <span className={`reimport-week__summary${unchanged ? ' reimport-week__summary--muted' : ''}`}>
                    {line.split('：').slice(1).join('：')}
                    {mode === 'replace' && d.diff?.clearedAssignments > 0 && `（會清除 ${d.diff.clearedAssignments} 個指派）`}
                    {newTag && <span className="reimport-tag">新的週次</span>}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="reimport-options">
            <label className={`reimport-option${mode === 'keep' ? ' reimport-option--selected' : ''}`}>
              <input
                type="radio"
                name="reimportMode"
                value="keep"
                checked={mode === 'keep'}
                onChange={() => onModeChange?.('keep')}
                className="reimport-option__radio"
              />
              <span className="reimport-option__title">保留之前的修改</span>
              <span className="reimport-option__desc">已在資料庫的週次不變，只匯入新的週次</span>
            </label>
            <label className={`reimport-option${mode === 'replace' ? ' reimport-option--selected' : ''}`}>
              <input
                type="radio"
                name="reimportMode"
                value="replace"
                checked={mode === 'replace'}
                onChange={() => onModeChange?.('replace')}
                className="reimport-option__radio"
              />
              <span className="reimport-option__title">捨棄修改，以 EPUB 為準</span>
              <span className="reimport-option__desc">已在資料庫的週次改回 EPUB 的內容</span>
            </label>
          </div>

          {mode === 'replace' && (
            <p className="reimport-note">
              已指派的人：節目仍存在的會保留；被移除節目的指派會清除並記錄在「最近變更」
            </p>
          )}

          <div className="reimport-actions">
            <button type="button" className="btn reimport-btn reimport-btn--secondary" onClick={onCancel} disabled={saving}>
              取消
            </button>
            <button type="button" className="btn btn--primary reimport-btn" onClick={onConfirm} disabled={saving}>
              {saving ? '儲存中…' : '確認匯入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
