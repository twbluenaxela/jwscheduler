'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { withCoverFallback } from '../lib/literature.mjs';
import CatalogView from './literature/CatalogView';
import RequestsView from './literature/RequestsView';
import ShipmentsView from './literature/ShipmentsView';
import InventoryView from './literature/InventoryView';

export default function LiteraturePage({ firebaseUser, people = [] }) {
  const [view, setView] = useState('requests');
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
  useEffect(() => { load(); }, [load]);
  return (
    <section className="lit-page">
      <div className="lit-segment" aria-label="書刊功能">
        {Object.entries({ requests: '申請', shipments: '到貨', catalog: '目錄', inventory: '清點' }).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>
      {view !== 'catalog' && loading && <p>正在載入書刊…</p>}
      {view !== 'catalog' && loadError && <div className="imp-error">{loadError} <button className="btn" onClick={load}>重試</button></div>}
      {!loading && !loadError && view === 'requests' && <RequestsView people={people} items={displayItems} request={request} />}
      {(!loading || items.length > 0) && !loadError && view === 'shipments' && <ShipmentsView items={displayItems} request={request} reloadCatalog={load} />}
      {(!loading || items.length > 0) && !loadError && view === 'inventory' && <InventoryView items={displayItems} request={request} reloadCatalog={load} />}
      {view === 'catalog' && <CatalogView items={items} setItems={setItems} loading={loading} loadError={loadError} load={load} request={request} />}
    </section>
  );
}
