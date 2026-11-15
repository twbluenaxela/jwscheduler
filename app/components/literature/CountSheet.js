'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORY_LABELS, matchPublications } from '../../lib/literature.mjs';
import { distributed, hubReportRows, s28Rows } from '../../lib/literatureInventory.mjs';
import PubThumb, { Sheet } from './PubThumb';

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export default function CountSheet({ id, items, request, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [uncounted, setUncounted] = useState(false);
  const [report, setReport] = useState('');
  const [adding, setAdding] = useState(false);
  const [checked, setChecked] = useState({});
  const [saving, setSaving] = useState({});
  const timers = useRef({});
  const pending = useRef({});

  const load = useCallback(async () => {
    try {
      setData(await request(`/api/literature/inventory/${id}`));
    } catch (err) {
      setError(err.message);
    }
  }, [id, request]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveLine(lineId, patch) {
    setSaving((s) => ({ ...s, [lineId]: '儲存中…' }));
    try {
      await request(`/api/literature/inventory/${id}/lines/${lineId}`, json('PATCH', patch));
      setSaving((s) => ({ ...s, [lineId]: '已儲存' }));
    } catch (err) {
      setError(err.message);
      setSaving((s) => ({ ...s, [lineId]: '儲存失敗' }));
    }
  }

  function change(line, patch) {
    setData((d) => ({
      ...d,
      lines: d.lines.map((l) => l.id === line.id ? { ...l, ...patch } : l),
    }));
    pending.current[line.id] = { ...pending.current[line.id], ...patch };
    setSaving((s) => ({ ...s, [line.id]: '等待儲存…' }));
    clearTimeout(timers.current[line.id]);
    timers.current[line.id] = setTimeout(() => {
      const value = pending.current[line.id];
      delete pending.current[line.id];
      saveLine(line.id, value);
    }, 500);
  }

  async function flush() {
    await Promise.all(Object.entries(pending.current).map(([lineId, patch]) => {
      clearTimeout(timers.current[lineId]);
      delete pending.current[lineId];
      return saveLine(lineId, patch);
    }));
  }

  if (!data) {
    return (
      <div>
        <button className="btn" onClick={onBack}>返回</button>
        {error || '載入中…'}
      </div>
    );
  }

  const { count, lines } = data;
  const counted = lines.filter((line) => line.onHand !== null).length;
  const rows = s28Rows(items, lines);
  const matches = new Set(matchPublications(query, items, { limit: items.length }).map((p) => p.id));
  const visible = rows.filter((row) => (
    (category === 'all' || row.publication.category === category) &&
    (!uncounted || row.onHand === null) &&
    (!query || matches.has(row.publication.id))
  ));
  const hub = hubReportRows(items, lines);

  async function finish() {
    if (counted < lines.length && !window.confirm('仍有未清點的品項，確定完成清點？')) return;
    await flush();
    try {
      await request(`/api/literature/inventory/${id}`, json('PATCH', { status: 'done' }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function add(publication) {
    try {
      await request(`/api/literature/inventory/${id}/lines`, json('POST', { publicationId: publication.id }));
      setAdding(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (report === 's28') {
    return (
      <div className="lit-print-area">
        <div className="lit-report-actions">
          <button className="btn" onClick={() => setReport('')}>返回清點</button>{' '}
          <button className="btn" onClick={() => window.print()}>列印</button>
        </div>
        <h1>{count.month} 存書月結記錄 S-28</h1>
        <table className="lit-report-table">
          <thead>
            <tr>
              {['項目編號', '名稱', '代號', '原有', '收', '現有', '發'].map((x) => <th key={x}>{x}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.publication.itemNumber}</td>
                <td>{row.publication.name}</td>
                <td>{row.publication.code}</td>
                <td>{row.opening}</td>
                <td>{row.received}</td>
                <td>{row.onHand ?? '—'}</td>
                <td>{distributed(row) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (report === 'hub') {
    return (
      <div>
        <div className="lit-actions">
          <button className="btn" onClick={() => setReport('')}>返回清點</button>
          <button
            className="btn"
            onClick={() => navigator.clipboard
              .writeText(hub.map((r) => `${r.publication.code}\t${r.onHand}`).join('\n'))
              .catch((err) => setError(err.message))}
          >
            複製
          </button>
        </div>
        <h1>JW Hub 填寫清單</h1>
        {error && <div className="imp-error">{error}</div>}
        {[...new Set(hub.map((r) => r.section))].map((section) => (
          <section key={section}>
            <h2>{section}</h2>
            {hub.filter((r) => r.section === section).map((r) => (
              <label className="lit-inventory-row" key={r.id}>
                <input
                  type="checkbox"
                  checked={!!checked[r.id]}
                  onChange={(e) => setChecked({ ...checked, [r.id]: e.target.checked })}
                />
                <span>{r.publication.code} · {r.publication.name}</span>
                <strong>{r.onHand}</strong>
              </label>
            ))}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        className="btn"
        onClick={async () => {
          await flush();
          onBack();
        }}
      >
        ← 返回清點
      </button>
      <div className="lit-header">
        <h1>{count.month} 清點</h1>
        <span className="lit-badge">{count.status === 'done' ? '完成' : '草稿'}</span>
      </div>
      <p>已清點 {counted} / {lines.length}</p>
      <progress max={lines.length || 1} value={counted} />
      <div className="lit-actions">
        <button className="btn" onClick={() => setReport('s28')}>S-28 表</button>
        <button className="btn" onClick={() => setReport('hub')}>JW Hub 填寫清單</button>
        <button className="btn" onClick={() => setAdding(true)}>加入品項</button>
        {count.status === 'draft' && (
          <button className="btn btn--primary" onClick={finish}>完成清點</button>
        )}
      </div>
      <input
        className="field__input"
        placeholder="搜尋書刊"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <label className="lit-check">
        <input type="checkbox" checked={uncounted} onChange={(e) => setUncounted(e.target.checked)} />
        {' '}只看未清點
      </label>
      <div className="chips lit-chips">
        <button className="chip" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
          全部
        </button>
        {Object.entries(CATEGORY_LABELS)
          .filter(([key]) => rows.some((r) => r.publication.category === key))
          .map(([key, label]) => (
            <button key={key} className="chip" aria-pressed={category === key} onClick={() => setCategory(key)}>
              {label}
            </button>
          ))}
      </div>
      {error && <div className="imp-error" role="alert">{error}</div>}
      {visible.map((line) => (
        <article className="lit-inventory-row" key={line.id}>
          <PubThumb publication={line.publication} />
          <div className="lit-inventory-meta">
            <span>原有 {line.opening} · 收 {line.received}</span>
            <button
              className="btn btn--sm"
              onClick={() => {
                const value = window.prompt('原有數量', line.opening);
                if (value !== null && /^\d+$/.test(value)) change(line, { opening: Number(value) });
              }}
            >
              編輯原有
            </button>
            <span className={distributed(line) < 0 ? 'lit-negative' : ''}>發 {distributed(line) ?? '—'}</span>
            <small>{saving[line.id]}</small>
          </div>
          <div className="lit-stepper">
            <button onClick={() => change(line, { onHand: Math.max(0, (line.onHand ?? 0) - 1) })}>−</button>
            <input
              aria-label={`${line.publication.name} 現有`}
              type="number"
              min="0"
              value={line.onHand ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                if (value === '' || /^\d+$/.test(value)) {
                  change(line, { onHand: value === '' ? null : Number(value) });
                }
              }}
            />
            <button onClick={() => change(line, { onHand: (line.onHand ?? 0) + 1 })}>＋</button>
          </div>
        </article>
      ))}
      {adding && (
        <Sheet title="加入品項" close={() => setAdding(false)}>
          <input
            className="field__input"
            placeholder="搜尋書刊"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {matchPublications(
            query,
            items.filter((p) => !lines.some((l) => l.publicationId === p.id)),
            { limit: 100 },
          ).map((p) => (
            <button className="lit-preview-line" key={p.id} onClick={() => add(p)}>
              <PubThumb publication={p} />
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
