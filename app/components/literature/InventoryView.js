'use client';
import { useCallback, useEffect, useState } from 'react';
import { Sheet } from './PubThumb';
import CountSheet from './CountSheet';

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export default function InventoryView({ items, request, reloadCatalog }) {
  const [counts, setCounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [month, setMonth] = useState(currentMonth);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setCounts((await request('/api/literature/inventory')).counts);
    } catch (err) {
      setError(err.message);
    }
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  async function start() {
    try {
      const result = await request('/api/literature/inventory', json('POST', { month }));
      setSelected(result.count.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function upload(chosen, previewOnly) {
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', chosen);
      const path = `/api/literature/inventory/import-report${previewOnly ? '?preview=1' : ''}`;
      const result = await request(path, { method: 'POST', body });
      if (previewOnly) {
        setFile(chosen);
        setPreview(result);
      } else {
        setPreview(null);
        await reloadCatalog();
        await load();
        setSelected(result.count.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    return (
      <CountSheet
        id={selected}
        items={items}
        request={request}
        onBack={() => {
          setSelected(null);
          load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="lit-header">
        <h1>每月清點</h1>
      </div>
      <div className="lit-inventory-controls">
        <div className="lit-inventory-month">
        <input
          className="field__input lit-month"
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        {!counts.some((count) => count.month === month) && (
          <button className="btn btn--primary" onClick={start}>開始本月清點</button>
        )}
        </div>
        <label className="btn btn--sm">
          匯入 JW Hub 庫存報告
          <input
            className="lit-file"
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              e.target.value = '';
              if (chosen) upload(chosen, true);
            }}
          />
        </label>
      </div>
      {error && <div className="imp-error" role="alert">{error}</div>}
      <div className="lit-shipment-list">
        {counts.map((count) => (
          <button className="lit-shipment" key={count.id} onClick={() => setSelected(count.id)}>
            <strong>
              {count.month.replace(/^(\d{4})-(\d{2})$/, (_, year, number) => `${year}年${Number(number)}月`)} <span className="lit-badge">{count.status === 'done' ? '完成' : '草稿'}</span>
            </strong>
            <span>已清點 {count.counted} / {count.total}</span>
          </button>
        ))}
      </div>
      {!counts.length && <p>尚無清點紀錄。</p>}
      {preview && (
        <Sheet title="確認庫存報告" close={() => setPreview(null)}>
          <p>{preview.month} · {preview.language} · {preview.rows.length} 項</p>
          {preview.duplicate && <div className="imp-error">此月份已完成清點。</div>}
          {preview.rows.map((row) => (
            <div className="lit-preview-line" key={row.code}>
              <span>{row.code} · {row.name} {row.action === 'create' && '（將新增）'}</span>
              <strong>{row.quantity}</strong>
            </div>
          ))}
          {error && <div className="imp-error">{error}</div>}
          <button className="btn btn--primary" disabled={busy || preview.duplicate} onClick={() => upload(file, false)}>
            確認匯入
          </button>
        </Sheet>
      )}
    </div>
  );
}
