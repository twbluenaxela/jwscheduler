'use client';
import { localizedName } from '../../lib/publicForm.mjs';
import { sectionLabel } from '../../lib/hubOrderable.mjs';
import Icon from './Icon';
import Menu from './Menu';
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
  requestable: true,
  orderable: true,
  specialOrder: false,
  countable: null,
});
const HUB_GROUPS = [
  ['add', '新增到目錄'],
  ['open', '恢復可訂購'],
  ['close', '暫停訂購'],
  ['specialOn', '標記特別預訂'],
  ['specialOff', '取消特別預訂'],
];
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
  const [hubOpen, setHubOpen] = useState(false),
    [hubText, setHubText] = useState(''),
    [hubPlan, setHubPlan] = useState(null),
    [hubBusy, setHubBusy] = useState(false),
    [hubError, setHubError] = useState(''),
    [addMissing, setAddMissing] = useState(true);
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
      languages: ['CHT', 'ENG', 'JPN'],
      year: next.getFullYear(),
      month: next.getMonth() + 1,
    });
  }
  async function savePeriod(e) {
    e.preventDefault();
    if (!period.languages.length) return;
    setBusy(true);
    setError('');
    try {
      const entry = periodicalEntry(period.kind, Number(period.year), Number(period.month), {
        format: period.format,
      });
      for (const language of period.languages) {
        const data = await request('/api/literature', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...entry,
            language,
            format: period.kind === 'w' ? period.format : 'standard',
          }),
        });
        updateItem(data.publication);
      }
      setPeriod(null);
      setToast({ msg: `期數已新增（${period.languages.length} 個語別）` });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function previewHub() {
    setHubBusy(true);
    setHubError('');
    try {
      setHubPlan(await request('/api/literature/catalog/orderable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: hubText }),
      }));
    } catch (err) {
      setHubPlan(null);
      setHubError(err.message);
    } finally {
      setHubBusy(false);
    }
  }
  async function applyHub() {
    setHubBusy(true);
    setHubError('');
    try {
      const data = await request('/api/literature/catalog/orderable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: hubText, apply: true, addMissing }),
      });
      await load();
      setHubOpen(false);
      setHubPlan(null);
      setHubText('');
      const counts = data.counts || {};
      setToast({ msg: `可訂購清單已更新（暫停 ${counts.close || 0}、恢復 ${counts.open || 0}、新增 ${counts.add || 0}）` });
    } catch (err) {
      setHubError(err.message);
    } finally {
      setHubBusy(false);
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
  const hubPlanData = hubPlan?.plan;
  const hubChangeCount = hubPlanData
    ? hubPlanData.open.length + hubPlanData.close.length + hubPlanData.specialOn.length +
      hubPlanData.specialOff.length + (addMissing ? hubPlanData.add.length : 0)
    : 0;
  const hubHasChanges = hubChangeCount > 0;
  const card = (p) => (
    <button
      key={p.id}
      className={`lit-card${p.active ? '' : ' lit-card--inactive'}${p.coverUrl ? '' : ' lit-card--placeholder'}`}
      onClick={() => edit(p)}
    >
      {p.coverUrl && <PubThumb publication={p} size="card" />}
      <span className="lit-card__body">
        {!p.coverUrl && <span className="lit-card__placeholder-code">{p.code}</span>}
        <strong className="lit-card__name">
          {p.note && <span className="lit-note-dot" />}
          {localizedName(p, items)}
          {p.specialOrder && <small className="lit-badge">特別預訂</small>}
          {p.orderable === false && <small className="lit-badge">暫停訂購</small>}
        </strong>
        {p.coverUrl ? <span className="lit-code">{p.code}</span> : <span className="lit-code">{[FORMAT_LABELS[p.format], LANGUAGE_LABELS[p.language]].filter(Boolean).join(' · ')}</span>}
      </span>
    </button>
  );
  return (
    <section className="lit-page">
      <div className="lit-search">
        <input className="field__input" placeholder={`搜尋 ${items.filter((p) => p.active).length} 項書刊`}
          value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn btn--primary lit-add" aria-label="新增" onClick={() => setActions(true)}>＋</button>
        <Menu label="更多目錄選項" items={[{ label: '更新可訂購清單', onSelect: () => {
          setHubError('');
          setHubPlan(null);
          setHubOpen(true);
        } }]} />
      </div>
      {actions && <Sheet title="新增" close={() => setActions(false)}>
        <div className="lit-action-sheet">
          <button className="btn" onClick={() => { setActions(false); edit(null); }}>新增書刊</button>
          <button className="btn" onClick={() => { setActions(false); openPeriod(); }}>新增期數</button>
        </div>
      </Sheet>}
      {hubOpen && <Sheet
        title="更新可訂購清單"
        close={() => { setHubOpen(false); setHubPlan(null); }}
        footer={<>
          <button className="btn" disabled={hubBusy} onClick={() => { setHubOpen(false); setHubPlan(null); }}>取消</button>
          <button className="btn btn--primary" disabled={hubBusy || !hubHasChanges} onClick={applyHub}>
            {hubBusy ? '更新中…' : hubHasChanges ? `確認更新（${hubChangeCount} 項變更）` : '目前已是最新'}
          </button>
        </>}
      >
        <div className="lit-form lit-hub-form">
          <label className="field">
            <span className="field__label">貼上 Hub 書刊清單</span>
            <textarea
              className="field__input lit-hub-textarea"
              rows={9}
              placeholder="把 Hub 書刊清單頁面全選複製後貼在這裡"
              value={hubText}
              onChange={(e) => setHubText(e.target.value)}
            />
          </label>
          <div className="lit-hub-preview-row">
            <button className="btn" disabled={hubBusy || !hubText.trim()} onClick={previewHub}>
              {hubBusy ? '預覽中…' : '預覽'}
            </button>
          </div>
          {hubError && <p className="imp-error" role="alert">{hubError}</p>}
          {hubPlanData && <>
            <p className="lit-hub-detected">已偵測：{hubPlan.sections.map(sectionLabel).join('、')} — 其他類別不會變更</p>
            {HUB_GROUPS.filter(([key]) => (hubPlanData[key] || []).length).map(([key, label]) => {
              const rows = hubPlanData[key] || [];
              return (
                <details key={key} className="lit-hub-group">
                  <summary>
                    <span>{label}</span>
                    <span className="lit-hub-count">{rows.length}</span>
                    <Icon name="chevronRight" className="lit-hub-chevron" />
                  </summary>
                  <ul>
                    {rows.map((row, index) => (
                      <li key={row.id || `${row.code}-${index}`}>
                        {row.code} · {row.name}
                        {row.format === 'large' && <small className="lit-badge">大字</small>}
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
            {hubPlanData.add.length > 0 && (
              <label className="lit-check">
                <input type="checkbox" checked={addMissing} onChange={(e) => setAddMissing(e.target.checked)} />{' '}
                同時新增目錄中沒有的 {hubPlanData.add.length} 項
              </label>
            )}
          </>}
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
        <p className="lit-loading">正在載入書刊…</p>
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
                <Icon name="close" />
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
                <label className="field"><span className="field__label">開放申請</span><input type="checkbox" role="switch" checked={form.requestable !== false} onChange={e => setForm({ ...form, requestable: e.target.checked })} /></label>
                <label className="field"><span className="field__label">可向分部訂購</span><input type="checkbox" role="switch" checked={form.orderable !== false} onChange={e => setForm({ ...form, orderable: e.target.checked })} /></label>
                <label className="field"><span className="field__label">特別預訂</span><input type="checkbox" role="switch" checked={form.specialOrder === true} onChange={e => setForm({ ...form, specialOrder: e.target.checked })} /></label>
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
                  <span className="field__label">語言（可複選，一次建立所有語別）</span>
                  <span className="lit-segment" role="group" aria-label="語言">
                    {[['CHT', '中'], ['ENG', '英'], ['JPN', '日']].map(([language, label]) => (
                      <button
                        key={language}
                        type="button"
                        aria-pressed={period.languages.includes(language)}
                        onClick={() => setPeriod((current) => ({
                          ...current,
                          languages: current.languages.includes(language)
                            ? current.languages.filter((x) => x !== language)
                            : [...current.languages, language],
                        }))}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
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
                <button className="btn btn--primary" disabled={busy || !period.languages.length}>
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
