'use client';
import Icon from './Icon';
import { useCallback, useEffect, useState } from 'react';
import PubThumb, { GROUPS, groupOf, issueLabel, sameId } from './PubThumb';
import { seriesOf } from '../../lib/literatureShipments.mjs';

const shortSeries = { w: '研讀版', wlp: '大字', mwb: '手冊', g: '警醒', wp: '公眾版' };

function itemLabel(publication) {
  const series = seriesOf(publication?.code || '');
  const language = publication?.language === 'ENG' ? ' 英' : publication?.language === 'JPN' ? ' 日' : '';
  return `${shortSeries[series] || publication?.name || publication?.code || '書刊'}${language}`;
}

export default function ShipmentDetail({ id, items, request, onBack }) {
  const [data, setData] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [error, setError] = useState('');
  const [pending, setPending] = useState({});
  const [batchPending, setBatchPending] = useState(false);
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
  const issues = [...new Set(data.allocation.filter((entry) => entry.recipients.length).map((entry) => {
    const publication = items.find((item) => sameId(item.id, entry.publication?.id)) || entry.publication;
    const series = seriesOf(publication?.code || '');
    return series ? `${shortSeries[series]} ${issueLabel(publication.code)}` : publication?.name || publication?.code || '書刊';
  }))];
  const remainder = data.allocation.filter((entry) => entry.remainder > 0);
  const shippedDate = /^(\d{4})-(\d{2})-(\d{2})/.exec(data.shipment.shippedAt || '');
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
  return <div className="lit-detail">
    <button className="lit-back" onClick={onBack}><Icon name="back" /> 到貨</button>
    <div className="lit-detail-header">
      <div><strong>裝箱單 {data.shipment.slipNumber}</strong>
        <span>{shippedDate ? `${Number(shippedDate[2])}/${Number(shippedDate[3])}` : '日期未提供'}</span></div>
      <details className="lit-menu"><summary aria-label="更多選項"><Icon name="more" /></summary>
        <button className="btn btn--danger" onClick={remove}>刪除裝箱單</button>
      </details>
    </div>
    {issues.length > 0 && <p className="lit-shipment-issues">{issues.join(' · ')}</p>}
    <div className="lit-progress-label">已發 {doneCount} / {members.length} 人</div>
    <progress className="lit-progress" max={members.length || 1} value={doneCount} />
    {error && <div className="imp-error" role="alert">{error}</div>}
    {GROUPS.map((group) => {
      const grouped = members.filter((p) => groupOf(p) === group);
      if (!grouped.length) return null;
      return <section key={group}>
        <h2 className="lit-category">{group === '未分組' ? group : `${group} 組`}</h2>
        <div>{grouped.map((p) => {
          const done = isDone(p);
          return <div className={`lit-delivery-person${done ? ' lit-delivery-person--done' : ''}`} key={p.personId} aria-busy={disabled || undefined}>
            <div className="lit-delivery-row">
              <button className="lit-delivery-main" disabled={disabled} onClick={() => togglePerson(p)}
                aria-label={`${p.name}，${done ? '取消全部發放' : '全部標為已發放'}`}>
                <span className={`lit-handout-check${done ? " is-done" : ""}`} aria-hidden="true">{done ? <Icon name="check" /> : "發"}</span>
                <span className="lit-delivery-copy">
                  <span><strong>{p.name}</strong> {p.groupRole && <small>{p.groupRole === 'overseer' ? '小組監督' : '助手'}</small>}</span>
                  {done && <span className="lit-delivery-summary">已發 {(() => {
                    const dates = p.items.map(({ recipient, publication }) => deliveryFor(recipient, publication.id)?.deliveredAt).filter(Boolean).sort();
                    const date = dates.length ? new Date(dates[dates.length - 1]) : null;
                    return date ? `${date.getMonth() + 1}/${date.getDate()}` : '';
                  })()}</span>}
                  <span className="lit-delivery-summary">{p.items.map(({ recipient, publication }, index) => <span key={index}>
                    {index > 0 && ' · '}{itemLabel(publication)} {recipient.quantity}
                    {recipient.source !== 'subscription' && <small>單次</small>}
                    {recipient.short && <small className="lit-short">不足</small>}
                  </span>)}</span>
                </span>
              </button>
              <button className="lit-delivery-expand" aria-label="逐項發放" aria-expanded={!!expanded[p.personId]}
                onClick={() => setExpanded((prev) => ({ ...prev, [p.personId]: !prev[p.personId] }))}>
                <Icon name="chevronDown" className={expanded[p.personId] ? "lit-chevron-open" : ""} />
              </button>
            </div>
            {expanded[p.personId] && <div className="lit-delivery-items">{p.items.map(({ recipient, publication }, index) => {
              const key = `${recipient.personId}-${publication.id}-${recipient.requestId || 'subscription'}`;
              const delivered = !!deliveryFor(recipient, publication.id);
              return <button className="lit-delivery-item" key={`${key}-${index}`} disabled={disabled}
                aria-pressed={delivered} onClick={() => toggle(recipient, publication.id)}>
                <span>{itemLabel(publication)} {recipient.quantity}</span><span>{delivered ? '已發' : '未發'}</span>
              </button>;
            })}</div>}
          </div>;
        })}</div>
      </section>;
    })}
    {remainder.length > 0 && <details className="lit-remainder-details">
      <summary><Icon name="chevronRight" /> 其餘入庫 {remainder.length} 項</summary>
      <div className="lit-remainder-list">{remainder.map((entry) => {
        const publication = items.find((item) => sameId(item.id, entry.publication?.id)) || entry.publication;
        return <div className="lit-remainder-row" key={entry.line.id}>
          <PubThumb publication={publication} />
          <span><strong>{publication?.name}</strong><small>{publication?.code}</small></span>
          <span>剩 {entry.remainder}</span>
        </div>;
      })}</div>
    </details>}
  </div>;
}
