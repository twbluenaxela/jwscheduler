'use client';
import { useMemo, useState } from 'react';
import Toast from '../Toast';
import PubThumb, { Sheet } from './PubThumb';
import {
  CATEGORY_LABELS,
  FORMAT_LABELS,
  LANGUAGE_LABELS,
  matchPublications,
  sortPublications,
  periodicalEntry,
} from '../../lib/literature.mjs';

const blank = () => ({
  name: '',
  code: '',
  category: 'other',
  language: 'CHT',
  format: 'standard',
  itemNumber: '',
  aliases: '',
  issue: '',
  note: '',
  active: true,
  countable: null,
});
const options = (labels) =>
  Object.entries(labels).map(([value, label]) => (
    <option key={value} value={value}>
      {label}
    </option>
  ));

function resizeCover(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file),
      img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 400 / img.width);
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('無法處理圖片'));
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('無法處理圖片'))),
        'image/jpeg',
        0.8,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('無法讀取圖片'));
    };
    img.src = url;
  });
}

export default function CatalogView({ items, setItems, loading, loadError, load, request }) {
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState('all'),
    [showInactive, setShowInactive] = useState(false);
  const [actions, setActions] = useState(false);
  const [form, setForm] = useState(null),
    [period, setPeriod] = useState(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState(null);
  const categories = Object.keys(CATEGORY_LABELS).filter((c) =>
    items.some((p) => p.category === c && (showInactive || p.active)),
  );
  const visible = useMemo(() => {
    const source = items.filter(
      (p) => (showInactive ? !p.active : p.active) && (category === 'all' || p.category === category),
    );
    if (!query.trim()) return sortPublications(source);
    // The shared matcher excludes inactive records; temporarily mark them active for matching.
    const original = new Map(source.map((p) => [p.id, p]));
    return matchPublications(
      query,
      source.map((p) => ({ ...p, active: true })),
      { limit: source.length },
    ).map((p) => original.get(p.id));
  }, [items, query, category, showInactive]);
  function edit(p) {
    setError('');
    setForm(p ? { ...p, aliases: (p.aliases || []).join('、') } : blank());
  }
  function updateItem(p) {
    setItems((prev) =>
      prev.some((x) => x.id === p.id) ? prev.map((x) => (x.id === p.id ? p : x)) : [...prev, p],
    );
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = {
        ...form,
        aliases: form.aliases
          .split(/[,，、]/)
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const data = await request(form.id ? `/api/literature/${form.id}` : '/api/literature', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      updateItem(data.publication);
      setForm(null);
      setToast({ msg: '書刊已儲存' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function deactivate() {
    if (!window.confirm(`確定要停用「${form.name}」嗎？`)) return;
    setBusy(true);
    setError('');
    try {
      const data = await request(`/api/literature/${form.id}`, { method: 'DELETE' });
      updateItem(data.publication);
      setForm(null);
      setToast({ msg: '書刊已停用' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function cover(file, remove = false) {
    setBusy(true);
    setError('');
    try {
      const body = remove ? undefined : await resizeCover(file);
      const data = await request(`/api/literature/${form.id}/cover`, {
        method: remove ? 'DELETE' : 'PUT',
        ...(remove ? {} : { headers: { 'Content-Type': 'image/jpeg' }, body }),
      });
      updateItem(data.publication);
      setForm((prev) => ({ ...prev, coverUrl: data.publication.coverUrl }));
      setToast({ msg: remove ? '封面已移除' : '封面已更新' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  function openPeriod() {
    const next = new Date();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    setError('');
    setPeriod({
      kind: 'w',
      format: 'standard',
      language: 'CHT',
      year: next.getFullYear(),
      month: next.getMonth() + 1,
    });
  }
  async function savePeriod(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const entry = periodicalEntry(period.kind, Number(period.year), Number(period.month), {
        format: period.format,
      });
      const data = await request('/api/literature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...entry,
          language: period.language,
          format: period.kind === 'w' ? period.format : 'standard',
        }),
      });
      updateItem(data.publication);
      setPeriod(null);
      setToast({ msg: '期數已新增' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const field = (label, key, type = 'text') => (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="field__input"
        type={type}
        value={form[key] || ''}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        required={key === 'name' || key === 'code'}
      />
    </label>
  );
  const select = (label, key, labels) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <select
        className="field__input field__select"
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      >
        {options(labels)}
      </select>
    </label>
  );
  const card = (p) => (
    <button
      key={p.id}
      className={`lit-card${p.active ? '' : ' lit-card--inactive'}`}
      onClick={() => edit(p)}
    >
      <PubThumb publication={p} size="card" />
      <span className="lit-card__body">
        <strong className="lit-card__name">{p.note && <span className="lit-note-dot" />}{p.name}</strong>
        <span className="lit-code">{p.code}</span>
      </span>
    </button>
  );
  return (
    <section className="lit-page">
      <div className="lit-search">
        <input className="field__input" placeholder={`搜尋 ${items.filter((p) => p.active).length} 項書刊`}
          value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn--primary lit-add" aria-label="新增" onClick={() => setActions(true)}>＋</button>
      </div>
      {actions && <Sheet title="新增" close={() => setActions(false)}>
        <div className="lit-action-sheet">
          <button className="btn" onClick={() => { setActions(false); edit(null); }}>新增書刊</button>
          <button className="btn" onClick={() => { setActions(false); openPeriod(); }}>新增期數</button>
        </div>
      </Sheet>}
      <div className="chips lit-chips">
        <button
          className="chip"
          aria-pressed={category === 'all' && !showInactive}
          onClick={() => { setCategory('all'); setShowInactive(false); }}
        >
          全部
        </button>
        {categories.map((c) => (
          <button
            key={c}
            className="chip"
            aria-pressed={category === c}
            onClick={() => { setCategory(c); setShowInactive(false); }}
          >
            {CATEGORY_LABELS[c]}
          </button>
        ))}
        <button className="chip" aria-pressed={showInactive} onClick={() => { setCategory('all'); setShowInactive(true); }}>
          已停用
        </button>
      </div>
      {loading ? (
        <p>正在載入書刊…</p>
      ) : loadError ? (
        <div className="imp-error">
          {loadError}{' '}
          <button className="btn btn--sm" onClick={load}>
            重試
          </button>
        </div>
      ) : !visible.length ? (
        <p>沒有符合的書刊。</p>
      ) : query.trim() ? (
        <div className="lit-grid">{visible.map(card)}</div>
      ) : (
        Object.keys(CATEGORY_LABELS).map((c) => {
          const group = visible.filter((p) => p.category === c);
          return group.length ? (
            <div key={c}>
              <h2 className="lit-category">{CATEGORY_LABELS[c]}</h2>
              <div className="lit-grid">{group.map(card)}</div>
            </div>
          ) : null;
        })
      )}
      {(form || period) && (
        <div
          className="sheet-backdrop open"
          onClick={() => !busy && (setForm(null), setPeriod(null))}
        >
          <div
            className="sheet lit-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={period ? '新增期數' : form.id ? '編輯書刊' : '新增書刊'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet__grab" />
            <header className="sheet__head">
              <strong>{period ? '新增期數' : form.id ? '編輯書刊' : '新增書刊'}</strong>
              <button
                type="button"
                className="sheet__close"
                aria-label="關閉"
                disabled={busy}
                onClick={() => {
                  setForm(null);
                  setPeriod(null);
                }}
              >
                ✕
              </button>
            </header>
            {form ? (
              <form className="lit-form" onSubmit={save}>
                {form.id && (
                  <div className="lit-cover-edit">
                    {form.coverUrl && <img src={form.coverUrl} alt="目前封面" />}
                    <label className="btn">
                      拍照／選擇封面
                      <input
                        className="lit-file"
                        type="file"
                        accept="image/*"
                        capture="environment"
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (file) cover(file);
                        }}
                      />
                    </label>
                    {form.coverUrl && (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => cover(null, true)}
                      >
                        移除封面
                      </button>
                    )}
                  </div>
                )}
                {field('名稱', 'name')}
                {field('代號', 'code')}
                {select('分類', 'category', CATEGORY_LABELS)}
                {select('語言', 'language', LANGUAGE_LABELS)}
                {select('格式', 'format', FORMAT_LABELS)}
                {field('項目編號', 'itemNumber')}
                {field('別名（以逗號或、分隔）', 'aliases')}
                {field('期數', 'issue')}
                {field('備註', 'note')}
                <label className="field">
                  <span className="field__label">納入盤點</span>
                  <select className="field__input" value={form.countable == null ? 'auto' : String(form.countable)}
                    onChange={(e) => setForm({ ...form, countable: e.target.value === 'auto' ? null : e.target.value === 'true' })}>
                    <option value="auto">自動</option>
                    <option value="true">是</option>
                    <option value="false">否</option>
                  </select>
                </label>
                <label className="lit-check">
                  <input
                    type="checkbox"
                    checked={!form.active}
                    onChange={(e) => setForm({ ...form, active: !e.target.checked })}
                  />{' '}
                  停用
                </label>
                {error && (
                  <div className="imp-error" role="alert">
                    {error}
                  </div>
                )}
                <div className="lit-actions">
                  <button className="btn btn--primary" disabled={busy}>
                    {busy ? '儲存中…' : '儲存'}
                  </button>
                  {form.id && form.active && (
                    <button
                      type="button"
                      className="btn btn--danger"
                      disabled={busy}
                      onClick={deactivate}
                    >
                      停用
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <form className="lit-form" onSubmit={savePeriod}>
                <label className="field">
                  <span className="field__label">種類</span>
                  <select
                    className="field__input field__select"
                    value={period.kind}
                    onChange={(e) => setPeriod({ ...period, kind: e.target.value })}
                  >
                    <option value="w">守望台研讀版</option>
                    <option value="mwb">聚會手冊</option>
                  </select>
                </label>
                {period.kind === 'w' && (
                  <label className="field">
                    <span className="field__label">格式</span>
                    <select
                      className="field__input field__select"
                      value={period.format}
                      onChange={(e) => setPeriod({ ...period, format: e.target.value })}
                    >
                      <option value="standard">一般</option>
                      <option value="large">大字版</option>
                    </select>
                  </label>
                )}
                <label className="field">
                  <span className="field__label">語言</span>
                  <select
                    className="field__input field__select"
                    value={period.language}
                    onChange={(e) => setPeriod({ ...period, language: e.target.value })}
                  >
                    <option value="CHT">中文</option>
                    <option value="ENG">英文</option>
                    <option value="JPN">日文</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">年份</span>
                  <input
                    className="field__input"
                    type="number"
                    min="2020"
                    max="2100"
                    required
                    value={period.year}
                    onChange={(e) => setPeriod({ ...period, year: e.target.value })}
                  />
                </label>
                <label className="field">
                  <span className="field__label">月份</span>
                  <select
                    className="field__input field__select"
                    value={period.month}
                    onChange={(e) => setPeriod({ ...period, month: e.target.value })}
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        {i + 1}月
                      </option>
                    ))}
                  </select>
                </label>
                {error && (
                  <div className="imp-error" role="alert">
                    {error}
                  </div>
                )}
                <button className="btn btn--primary" disabled={busy}>
                  {busy ? '新增中…' : '新增'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
      {toast && <Toast toast={toast} onHide={() => setToast(null)} />}
    </section>
  );
}
