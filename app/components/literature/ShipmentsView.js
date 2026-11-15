'use client';
import { useCallback, useEffect, useState } from 'react';
import PubThumb, { Sheet } from './PubThumb';
import ShipmentDetail from './ShipmentDetail';

export default function ShipmentsView({ items, request, reloadCatalog, initialId }) {
  const [shipments, setShipments] = useState([]);
  const [selected, setSelected] = useState(initialId || null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setShipments((await request('/api/literature/shipments')).shipments); }
    catch (err) { setError(err.message); }
  }, [request]);
  useEffect(() => { load(); }, [load]);
  async function parse(file) {
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      setPreview(await request('/api/literature/shipments/parse', { method: 'POST', body }));
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    setError('');
    try {
      const result = await request('/api/literature/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slipNumber: preview.slipNumber, shippedAt: preview.shippedAt, source: 'jwhub-pdf', lines: preview.lines }),
      });
      setPreview(null);
      setSelected(result.shipment.id);
      await load();
      await reloadCatalog();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  if (selected) return <ShipmentDetail id={selected} items={items} request={request} onBack={() => { setSelected(null); load(); }} />;
  return <div>
    <label className="btn lit-upload">{busy ? '讀取中…' : '上傳裝箱單 PDF'}
      <input className="lit-file" type="file" accept="application/pdf" disabled={busy} onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) parse(file);
      }} />
    </label>
    {error && <div className="imp-error" role="alert">{error}</div>}
    {!shipments.length && <p>還沒有到貨紀錄。按上傳裝箱單 PDF 新增。</p>}
    <div className="lit-shipment-list">{shipments.map((s) => <button className="lit-shipment" key={s.id}
      onClick={() => setSelected(s.id)}><span><strong>裝箱單 {s.slipNumber}</strong>
        <small>{s.shippedAt?.slice(0, 10) || '日期未提供'} · {s.lineCount} 項 · {s.totalQuantity.toLocaleString()} 本</small>
      </span></button>)}</div>
    {preview && <Sheet title="確認裝箱單" close={() => setPreview(null)}>
      <p>裝箱單 {preview.slipNumber} · {preview.shippedAt || '日期未提供'}</p>
      {preview.duplicate && <div className="imp-error">此裝箱單已匯入，無法重複儲存。</div>}
      {preview.lines.map((line, index) => <div className="lit-preview-line" key={index}><PubThumb publication={items.find((item) => String(item.id) === String(line.publicationId)) || line.publication} code={line.code} name={line.action === 'create' ? `將新增：${line.createData.name}` : undefined} /><span>{line.action === 'create' ? `將新增：${line.createData.name}` : line.publication?.name || line.code}</span><strong>×{line.quantity}</strong></div>)}
      {error && <div className="imp-error">{error}</div>}
      <button className="btn btn--primary" disabled={busy || preview.duplicate} onClick={save}>{busy ? '匯入中…' : '確認匯入'}</button>
    </Sheet>}
  </div>;
}
