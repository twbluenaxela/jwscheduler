'use client';
import { useState } from 'react';
import Icon from './Icon';
import PubThumb, { Sheet } from './PubThumb';

function OrderRow({ row, stock, mark, busy, paused }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const publication = row.publication || {};
  async function copy() {
    try {
      await navigator.clipboard.writeText(row.hubCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className={`lit-order-row${stock ? ' lit-order-row--stock' : ''}${paused ? ' lit-order-row--paused' : ''}`}>
      <div className="lit-order-row-main">
        <button className="lit-order-expand" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <PubThumb publication={publication} />
          <span className="lit-order-name">
            {publication.name}
            {publication.specialOrder && <small className="lit-badge">特別預訂</small>}
          </span>
          <span className="lit-order-quantity">
            {paused
              ? <small>需要 {row.need} · 庫存 {row.stock}</small>
              : <><strong>×{stock ? row.need : row.order}</strong><small>需要 {row.need} · 庫存 {row.stock}</small></>}
          </span>
          <Icon name={expanded ? 'chevronDown' : 'chevronRight'} />
        </button>
        <button className="lit-order-code" onClick={copy}>{copied ? '已複製' : row.hubCode}</button>
      </div>
      <div className={`lit-order-details${expanded ? ' is-open' : ''}`}>
        <div>
          {row.stockDetail?.fromShipments > 0 && <p className="lit-order-hint">庫存＝清點 {row.stockDetail.base} ＋ 裝箱單剩 {row.stockDetail.fromShipments}</p>}
          {row.requests.map((item) => <p key={item.requestId}>{item.personName || item.guestName || '訪客'} ×{item.quantity}</p>)}
        </div>
      </div>
      {stock && !paused && <button className="btn lit-order-mark" disabled={busy} onClick={() => mark(row.requests, 'received')}>標為已到</button>}
    </div>
  );
}

export default function OrderList({ data, loading, error, reload, close, mark, busy }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const toOrder = data?.toOrder || [];
  const fromStock = data?.fromStock || [];
  // Paused titles still show demand, but never enter the order we place.
  const isPaused = (row) => row.publication?.orderable === false;
  const activeToOrder = toOrder.filter((row) => !isPaused(row));
  const activeFromStock = fromStock.filter((row) => !isPaused(row));
  const paused = [
    ...toOrder.filter(isPaused).map((row) => ({ row, stock: false })),
    ...fromStock.filter(isPaused).map((row) => ({ row, stock: true })),
  ];
  async function copyList() {
    try {
      await navigator.clipboard.writeText([...activeToOrder].sort((a, b) => a.hubCode.localeCompare(b.hubCode)).map((row) => `${row.hubCode} ×${row.order}`).join('\n'));
      setCopied(true);
      setCopyError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError(true);
    }
  }
  return (
    <Sheet title="訂購清單" close={close}>
      <div className="lit-order-sheet">
        {loading && <div className="lit-order-skeleton" aria-label="載入中"><span /><span /><span /></div>}
        {error && <div className="imp-error" role="alert">{error} <button className="btn" onClick={reload}>重試</button></div>}
        {!loading && !error && data && <>
          {!data.hasInventoryCount && <p className="lit-order-hint">還沒清點，庫存以 0 計</p>}
          {!activeToOrder.length && !activeFromStock.length && !paused.length && <p>目前沒有待訂的申請</p>}
          {activeToOrder.length > 0 && <section>
            <h2 className="lit-category">要訂（{activeToOrder.length} 項）</h2>
            {activeToOrder.map((row) => <OrderRow key={row.publication.id} row={row} mark={mark} busy={busy} />)}
          </section>}
          {activeFromStock.length > 0 && <section>
            <div className="lit-order-section-head">
              <h2 className="lit-category">庫存夠，直接發（{activeFromStock.length}）</h2>
              <button className="btn" disabled={busy} onClick={() => mark(activeFromStock.flatMap((row) => row.requests), 'received')}>全部標為已到</button>
            </div>
            {activeFromStock.map((row) => <OrderRow key={row.publication.id} row={row} stock mark={mark} busy={busy} />)}
          </section>}
          {data.standing.length > 0 && <section>
            <h2 className="lit-category">定期要調整</h2>
            <p className="lit-order-hint lit-order-standing-hint">到 JW Hub 改定期訂單</p>
            {data.standing.map((row) => (
              <div className="lit-order-row lit-order-row--standing" key={`${row.series}:${row.language}`}>
                <PubThumb code={row.series} language={row.language} />
                <span className="lit-order-name">{row.label}</span>
                <span className="lit-order-quantity">
                  <strong>改成 {row.now}</strong>
                  <small>上次到 {row.last}</small>
                </span>
                <span className={`lit-order-diff${row.diff > 0 ? ' lit-order-diff--increase' : ''}`}>
                  {row.diff > 0 ? `+${row.diff}` : `−${Math.abs(row.diff)}`}
                </span>
              </div>
            ))}
          </section>}
          {paused.length > 0 && <section>
            <h2 className="lit-category">暫停訂購</h2>
            <p className="lit-order-hint lit-order-paused-hint">目前無法向分部訂購，有庫存時仍可發放</p>
            {paused.map(({ row, stock }) => <OrderRow key={row.publication.id} row={row} stock={stock} paused />)}
          </section>}
          {activeToOrder.length > 0 && <footer className="lit-order-footer">
            {copyError && <span role="alert">複製失敗，請重試</span>}
            <button className="btn" onClick={copyList}>{copied ? '已複製' : '複製清單'}</button>
            <button className="btn btn--primary" disabled={busy} onClick={() => mark(activeToOrder.flatMap((row) => row.requests), 'ordered')}>全部標為已訂</button>
          </footer>}
        </>}
      </div>
    </Sheet>
  );
}
