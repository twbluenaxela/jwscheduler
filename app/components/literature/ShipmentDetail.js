'use client';
import { useCallback, useEffect, useState } from 'react';
import PubThumb, { GROUPS, groupOf, issueLabel, sameId } from './PubThumb';

export default function ShipmentDetail({ id, items, request, onBack }) {
  const [data, setData] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState({});
  const [batchPending, setBatchPending] = useState(false);
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
      return true;
    } catch (err) {
      setDeliveries(original);
      setError(err.message);
      return false;
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
  const doneCount = members.filter(isDone).length;
  const disabled = batchPending || Object.values(pending).some(Boolean);
  async function togglePerson(person) {
    const done = isDone(person);
    setBatchPending(true);
    for (const { recipient, publication } of person.items) {
      if (!!deliveryFor(recipient, publication.id) !== done) {
        if (!await toggle(recipient, publication.id)) break;
      }
    }
    setBatchPending(false);
  }
  return <div>
    <button className="lit-back" onClick={onBack}>‹ 到貨</button>
    <div className="lit-detail-header">
      <div><strong>裝箱單 {data.shipment.slipNumber}</strong>
        <span>{data.shipment.shippedAt?.slice(0, 10) || '日期未提供'}</span></div>
      <details className="lit-menu"><summary aria-label="更多選項">…</summary>
        <button className="btn btn--danger" onClick={remove}>刪除裝箱單</button>
      </details>
    </div>
    <div className="lit-progress-label">已發 {doneCount} / {members.length} 人</div>
    <progress className="lit-progress" max={members.length || 1} value={doneCount} />
    {error && <div className="imp-error" role="alert">{error}</div>}
    {GROUPS.map((group) => {
      const grouped = members.filter((p) => groupOf(p) === group);
      if (!grouped.length) return null;
      return <section key={group}>
        <h2 className="lit-category">{group === '未分組' ? group : `${group} 組`}</h2>
        <div className="lit-grid">{grouped.map((p) => <article key={p.personId}
          className={`lit-sort-card${isDone(p) ? ' lit-sort-card--done' : ''}`}
          onClick={() => { if (!disabled) togglePerson(p); }}>
          <button className="lit-sort-toggle" disabled={disabled} onClick={(event) => { event.stopPropagation(); togglePerson(p); }}
            aria-label={`${p.name}，${isDone(p) ? '取消全部發放' : '全部標為已發放'}`}>
            <strong>{p.name}</strong><span className="lit-round-check" aria-hidden="true">{isDone(p) ? '✓' : ''}</span>
          </button>
          <div className="lit-sort-items">{p.items.map(({ recipient, publication }, index) => {
            const key = `${recipient.personId}-${publication.id}-${recipient.requestId || 'subscription'}`;
            const delivered = !!deliveryFor(recipient, publication.id);
            return <button className="lit-sort-item" key={`${key}-${index}`} disabled={disabled}
              aria-pressed={delivered} onClick={(event) => { event.stopPropagation(); toggle(recipient, publication.id); }}>
              <PubThumb publication={publication} />
              <span>{issueLabel(publication.code)} ×{recipient.quantity}
                {recipient.source !== 'subscription' && <small>單次</small>}
                {recipient.short && <small className="lit-short">不足</small>}
                {delivered && <small>已發</small>}
              </span>
            </button>;
          })}</div>
        </article>)}</div>
      </section>;
    })}
    <h2 className="lit-category">入庫</h2>
    <div className="lit-remainder-list">{data.allocation.filter((entry) => entry.remainder > 0).map((entry) => {
      const publication = items.find((item) => sameId(item.id, entry.publication?.id)) || entry.publication;
      return <div className="lit-remainder-row" key={entry.line.id}>
        <PubThumb publication={publication} />
        <span><strong>{publication?.name}</strong><small>{publication?.code}</small></span>
        <span>剩 {entry.remainder}</span>
      </div>;
    })}</div>
    {!data.allocation.some((entry) => entry.remainder > 0) && <p>沒有剩餘書刊。</p>}
  </div>;
}
