'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { withCoverFallback } from '../lib/literature.mjs';
import CatalogView from './literature/CatalogView';
import RequestsView from './literature/RequestsView';
import ShipmentsView from './literature/ShipmentsView';
import InventoryView from './literature/InventoryView';

export default function LiteraturePage({ firebaseUser, people = [] }) {
  const initialized = useRef(false);
  const [view, setView] = useState(null);
  const [initialId, setInitialId] = useState(null);
  const [items, setItems] = useState([]);
  const displayItems = useMemo(() => withCoverFallback(items), [items]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const request = useCallback(async (path, init = {}) => {
    const token = await firebaseUser.getIdToken();
    const response = await fetch(path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '操作失敗，請重試');
    return data;
  }, [firebaseUser]);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setItems((await request('/api/literature')).publications);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [request]);
  const loadInitial = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [catalog, shipmentList, inventory] = await Promise.all([
        request('/api/literature'),
        request('/api/literature/shipments'),
        request('/api/literature/inventory'),
      ]);
      setItems(catalog.publications);
      if (initialized.current) return;
      initialized.current = true;
      const latest = shipmentList.shipments[0];
      const date = latest && new Date(latest.shippedAt || latest.createdAt);
      const age = date ? Date.now() - date.getTime() : NaN;
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      if (latest?.pendingPeople > 0 && age >= 0 && age <= 30 * 24 * 60 * 60 * 1000) {
        setInitialId(latest.id);
        setView('shipments');
      } else if (inventory.counts.some((count) => count.month === month && count.status === 'draft')) {
        setView('inventory');
      } else {
        setView('requests');
      }
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [request]);
  useEffect(() => { loadInitial(); }, [loadInitial]);
  if (!view) return <section className="lit-page">{loadError
    ? <div className="imp-error">{loadError} <button className="btn" onClick={loadInitial}>重試</button></div>
    : <p className="lit-loading">正在載入書刊…</p>}</section>;
  return (
    <section className="lit-page">
      <div className="lit-segment" aria-label="書刊功能">
        {Object.entries({ requests: '申請', shipments: '到貨', catalog: '目錄', inventory: '清點' }).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={view === key} onClick={() => { setInitialId(null); setView(key); }}>{label}</button>
        ))}
      </div>
      {view !== 'catalog' && loading && <p className="lit-loading">正在載入書刊…</p>}
      {view !== 'catalog' && loadError && <div className="imp-error">{loadError} <button className="btn" onClick={load}>重試</button></div>}
      {!loading && !loadError && view === 'requests' && <RequestsView people={people} items={displayItems} request={request} />}
      {(!loading || items.length > 0) && !loadError && view === 'shipments' && <ShipmentsView initialId={initialId} items={displayItems} request={request} reloadCatalog={load} />}
      {(!loading || items.length > 0) && !loadError && view === 'inventory' && <InventoryView items={displayItems} request={request} reloadCatalog={load} />}
      {view === 'catalog' && <CatalogView items={items} setItems={setItems} loading={loading} loadError={loadError} load={load} request={request} />}
    </section>
  );
}
