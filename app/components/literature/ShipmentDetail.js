'use client';
import { useCallback, useEffect, useState } from 'react';
import PubThumb, { GROUPS, groupOf, sameId } from './PubThumb';

export default function ShipmentDetail({ id, items, request, onBack }) {
  const [data, setData] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState({});
  const [expanded, setExpanded] = useState({});
  const load = useCallback(async () => {
    try {
      const [detail, result] = await Promise.all([request(`/api/literature/shipments/${id}`), request(`/api/literature/deliveries?shipmentId=${id}`)]);
      setData(detail);
      setDeliveries(result.deliveries);
      setError('');
    } catch (err) { setError(err.message); }
  }, [id, request]);
  useEffect(() => { load(); }, [load]);
  function deliveryFor(recipient, publicationId) {
    return deliveries.find((d) => sameId(d.personId, recipient.personId) && sameId(d.publicationId, publicationId) && (recipient.requestId ? sameId(d.requestId, recipient.requestId) : !d.requestId));
  }
  async function toggle(recipient, publicationId) {
    const key = `${recipient.personId}-${publicationId}-${recipient.requestId || 'subscription'}`;
    const existing = deliveryFor(recipient, publicationId);
    const original = deliveries;
    setPending((prev) => ({ ...prev, [key]: true }));
    setError('');
    if (existing) setDeliveries((prev) => prev.filter((d) => d !== existing));
    else setDeliveries((prev) => [...prev, { id: `pending-${key}`, personId: recipient.personId, publicationId, requestId: recipient.requestId }]);
    try {
      if (existing) await request(`/api/literature/deliveries/${existing.id}`, { method: 'DELETE' });
      else await request('/api/literature/deliveries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ personId: recipient.personId, publicationId, quantity: recipient.quantity, shipmentId: id, ...(recipient.requestId ? { requestId: recipient.requestId } : {}) }) });
      await load();
    } catch (err) {
      setDeliveries(original);
      setError(err.message);
    } finally { setPending((prev) => ({ ...prev, [key]: false })); }
  }
  async function remove() {
    if (!window.confirm('確定刪除這張裝箱單及其發放紀錄？')) return;
    try { await request(`/api/literature/shipments/${id}`, { method: 'DELETE' }); onBack(); }
    catch (err) { setError(err.message); }
  }
  if (!data) return <div><button className="btn" onClick={onBack}>返回</button>{error ? <div className="imp-error">{error}</div> : <p>載入中…</p>}</div>;
  const people = new Map();
  data.allocation.forEach((entry) => entry.recipients.forEach((recipient) => {
    if (!people.has(recipient.personId)) people.set(recipient.personId, { ...recipient, items: [] });
    people.get(recipient.personId).items.push({ recipient, publication: items.find((item) => sameId(item.id, entry.publication?.id)) || entry.publication });
  }));
  const members = [...people.values()];
  const isDone = (p) => p.items.every(({ recipient, publication }) => !!deliveryFor(recipient, publication.id));
  return <div>
    <button className="btn" onClick={onBack}>← 返回到貨</button>
    <div className="lit-header"><div><h1>裝箱單 {data.shipment.slipNumber}</h1><span>{data.shipment.shippedAt?.slice(0, 10) || '日期未提供'} · 已發 {members.filter(isDone).length} / {members.length} 人</span></div><details><summary className="btn">更多</summary><button className="btn btn--danger" onClick={remove}>刪除裝箱單</button></details></div>
    {error && <div className="imp-error" role="alert">{error}</div>}
    <div className="lit-group-grid">{GROUPS.map((group) => {
      const grouped = members.filter((p) => groupOf(p) === group);
      if (!grouped.length) return null;
      return <section key={group}><h2 className="lit-category">{group === '未分組' ? group : `服務小組 ${group}`}</h2>{grouped.map((p) => <article key={p.personId} className={`lit-sort-card${isDone(p) ? ' lit-sort-card--done' : ''}`}>
        <button className="lit-sort-toggle" onClick={() => setExpanded((prev) => ({ ...prev, [p.personId]: !prev[p.personId] }))} aria-expanded={!isDone(p) || !!expanded[p.personId]}><strong>{isDone(p) && '✓ '}{p.name}</strong>{isDone(p) && <span>{expanded[p.personId] ? '收合' : '展開'}</span>}</button>
        <div className="lit-sort-items" hidden={isDone(p) && !expanded[p.personId]}>{p.items.map(({ recipient, publication }, index) => {
          const key = `${recipient.personId}-${publication.id}-${recipient.requestId || 'subscription'}`;
          return <label className="lit-sort-item" key={`${key}-${index}`}><PubThumb publication={publication} /><span>×{recipient.quantity} <span className="lit-badge">{recipient.source === 'subscription' ? '定期' : '單次'}</span> {recipient.short && <span className="lit-badge lit-badge--short">不足</span>}</span><input type="checkbox" checked={!!deliveryFor(recipient, publication.id)} disabled={Object.values(pending).some(Boolean)} onChange={() => toggle(recipient, publication.id)} aria-label={`${p.name} ${publication.name} 已發放`} /></label>;
        })}</div>
      </article>)}</section>;
    })}</div>
    <h2 className="lit-category">入庫（剩餘）</h2>
    {data.allocation.filter((entry) => entry.remainder > 0).map((entry) => <div className="lit-preview-line" key={entry.line.id}><PubThumb publication={items.find((item) => sameId(item.id, entry.publication?.id)) || entry.publication} /><strong>剩 {entry.remainder} 本入庫</strong></div>)}
    {!data.allocation.some((entry) => entry.remainder > 0) && <p>沒有剩餘書刊。</p>}
  </div>;
}
