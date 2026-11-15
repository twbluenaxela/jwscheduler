'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { matchPublications } from '../../lib/literature.mjs';
import { distributed, expected, hubReportRows, s28Rows } from '../../lib/literatureInventory.mjs';
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
  const [filter, setFilter] = useState('stock');
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
    (filter === 'all' || (filter === 'uncounted' ? row.onHand === null : expected(row) > 0 || row.onHand > 0)) &&
    (!query || matches.has(row.publication.id))
  ));
  const hub = hubReportRows(items, lines);
  const stockCount = rows.filter((row) => expected(row) > 0 || row.onHand > 0).length;
  const monthLabel = count.month.replace(/^(\d{4})-(\d{2})$/, (_, year, month) => `${year}年${Number(month)}月`);

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
          <button className="lit-back" onClick={() => setReport('')}>‹ 清點</button>{' '}
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
        <div className="lit-report-actions">
          <button className="lit-back" onClick={() => setReport('')}>‹ 清點</button>
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
        {!hub.length && <p>還沒有任何現有數量。先在清點表填入數字，這裡就會列出要填到 JW Hub 的項目。</p>}
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
        className="lit-back"
        onClick={async () => {
          await flush();
          onBack();
        }}
      >
        ‹ 清點
      </button>
      <div className="lit-header">
        <h1>{monthLabel} 清點</h1>
        <span className="lit-badge">{count.status === 'done' ? '完成' : '草稿'}</span>
      </div>
      <div className="lit-progress-label">已清點 {counted} / {lines.length}</div>
      <progress className="lit-progress" max={lines.length || 1} value={counted} />
      <div className="lit-count-actions">
        <button className="btn btn--sm" onClick={() => setReport('s28')}>S-28 表</button>
        <button className="btn btn--sm" onClick={() => setReport('hub')}>JW Hub 清單</button>
        <button className="btn btn--sm" onClick={() => setAdding(true)}>加入品項</button>
      </div>
      <div className="lit-segment lit-count-filters" aria-label="清點篩選">
        <button aria-pressed={filter === 'stock'} onClick={() => setFilter('stock')}>有庫存 ({stockCount})</button>
        <button aria-pressed={filter === 'uncounted'} onClick={() => setFilter('uncounted')}>未清點 ({lines.length - counted})</button>
        <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>全部 ({lines.length})</button>
      </div>
      <input
        className="field__input"
        placeholder="搜尋書刊"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {error && <div className="imp-error" role="alert">{error}</div>}
      {visible.map((line) => {
        const amount = distributed(line);
        return (
          <article className="lit-count-row" key={line.id}>
            <PubThumb publication={line.publication} />
            <div className="lit-count-meta">
              <strong title={line.publication.name}>{line.publication.name}</strong>
              <span>{line.publication.code} · <button className="lit-opening" onClick={() => {
                const value = window.prompt('原有數量', line.opening);
                if (value !== null && /^\d+$/.test(value)) change(line, { opening: Number(value) });
              }}>原有 {line.opening}</button> ＋收 {line.received}</span>
              {saving[line.id] === '儲存失敗' && <small className="lit-count-error">儲存失敗</small>}
            </div>
            <div className="lit-count-value">
              {line.onHand === null && <span>應有 {expected(line)}</span>}
              <div>
                {line.onHand === null && <button className="lit-count-check" aria-label="與應有相同" onClick={() => change(line, { onHand: expected(line) })}>✓</button>}
                <input
                  aria-label={`${line.publication.name} 現有`}
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={line.onHand ?? ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || /^\d+$/.test(value)) {
                      change(line, { onHand: value === '' ? null : Number(value) });
                    }
                  }}
                />
              </div>
              {amount !== null && <span className={amount < 0 ? 'lit-count-error' : ''}>{amount < 0 ? `多 ${Math.abs(amount)}` : `發 ${amount}`}</span>}
            </div>
          </article>
        );
      })}
      {count.status === 'draft' && (
        <button className="btn btn--primary lit-count-finish" onClick={finish}>完成清點</button>
      )}
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
              <span>{p.name} · {p.code}</span>
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
