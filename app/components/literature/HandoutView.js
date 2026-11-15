'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { handoutSummary } from '../../lib/literatureShipments.mjs';
import Icon from './Icon';
import Menu from './Menu';
import PubThumb, { Sheet, groupOf } from './PubThumb';
import ShipmentsView from './ShipmentsView';

function Check({ done = false }) {
  return (
    <span className={`lit-handout-check${done ? ' is-done' : ''}`} aria-hidden="true">
      {done ? <Icon name="check" /> : '發'}
    </span>
  );
}

function PersonRow({ person, pending, onMark, onSelect }) {
  return (
    <div className="lit-handout-row" aria-busy={pending || undefined}>
      <button
        className="lit-handout-main"
        disabled={pending}
        aria-label={`${person.name}，標為已發`}
        onClick={() => onMark(person)}
      >
        <Check />
        <span className="lit-handout-copy">
          <strong>{person.name} {person.guest && <small className="lit-badge">名單外</small>}</strong>
          <span>
            {handoutSummary(person.items)}{' '}
            {person.items.some(item => item.source === 'request') && <small>單次</small>}{' '}
            {person.items.some(item => item.short) && <small className="lit-short">不足</small>}
          </span>
        </span>
      </button>
      <button
        className="lit-delivery-expand"
        disabled={pending}
        aria-label="逐項發放"
        onClick={() => onSelect(person)}
      >
        <Icon name="chevronRight" />
      </button>
    </div>
  );
}

function DeliveredRow({ person, pending, onUndo }) {
  return (
    <button
      className="lit-handout-main lit-handout-done"
      disabled={pending}
      aria-busy={pending || undefined}
      aria-label={`${person.name}，已發，點一下取消`}
      onClick={() => onUndo(person)}
    >
      <Check done />
      <span className="lit-handout-copy">
        <strong>{person.name} {person.guest && <small className="lit-badge">名單外</small>}</strong>
        <span>{handoutSummary(person.items)}</span>
      </span>
      <time>
        {new Date(person.deliveredAt).toLocaleTimeString('zh-TW', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
          timeZone: 'Asia/Taipei',
        })}
      </time>
    </button>
  );
}

function Snackbar({ snack, onClose, onHeight }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    const measure = () => onHeight(element.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeight]);
  return (
    <div ref={ref} className="lit-handout-snack" role="status" aria-live="polite">
      <span>{snack.text}</span>
      <button onClick={() => { onClose(); snack.undo(); }}>復原</button>
    </div>
  );
}

export default function HandoutView({ items, request, reloadCatalog }) {
  const [data, setData] = useState({ people: [], delivered: [], olderShipments: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('全部');
  const [selected, setSelected] = useState(null);
  const [shipments, setShipments] = useState(false);
  const [snack, setSnack] = useState(null);
  const [snackHeight, setSnackHeight] = useState(60);
  const [pending, setPending] = useState(new Set());
  const dataRef = useRef(data);
  dataRef.current = data;
  const pendingRef = useRef(new Set());
  const revision = useRef(0);

  const load = useCallback(async () => {
    const startedAt = revision.current;
    try {
      const result = await request('/api/literature/handouts');
      if (startedAt === revision.current && pendingRef.current.size === 0) {
        setData(result);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(() => setSnack(null), 5000);
    return () => clearTimeout(timer);
  }, [snack]);

  function begin(personId) {
    if (pendingRef.current.has(personId)) return false;
    pendingRef.current.add(personId);
    revision.current += 1;
    setPending(new Set(pendingRef.current));
    return true;
  }

  function finish(personId) {
    pendingRef.current.delete(personId);
    setPending(new Set(pendingRef.current));
    if (pendingRef.current.size === 0) load();
  }

  function restorePerson(current, original, personId) {
    const restore = (list, previous) => {
      const remaining = list.filter(person => person.personId !== personId);
      return [...remaining, ...previous.filter(person => person.personId === personId)];
    };
    return {
      ...current,
      people: restore(current.people, original.people),
      delivered: restore(current.delivered, original.delivered),
    };
  }

  async function mark(person, chosen = person.items) {
    if (person.guest) {
      const key = person.guestKey || `guest:${person.requestId}`;
      if (!begin(key)) return;
      try {
        for (const item of chosen) await request(`/api/literature/requests/${item.requestId}/handout`, { method: 'POST' });
        setSnack({ text: `已發給 ${person.name}`, undo: () => undo({ ...person, items: chosen }) });
      } catch (err) { setError(`發放失敗：${err.message}，請重試。`); }
      finally { finish(key); }
      return;
    }
    if (!begin(person.personId)) return;
    setError('');
    navigator.vibrate?.(10);
    const previous = dataRef.current;
    const keys = new Set(chosen.map(item => item.key));
    const optimistic = {
      ...person,
      items: chosen,
      deliveryIds: [],
      deliveredAt: new Date().toISOString(),
    };
    setData(current => ({
      ...current,
      people: current.people.map(p => p.personId === person.personId
        ? { ...p, items: p.items.filter(item => !keys.has(item.key)) }
        : p).filter(p => p.items.length),
      delivered: [optimistic, ...current.delivered],
    }));
    setSelected(null);
    try {
      const result = await request('/api/literature/deliveries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: chosen.map(item => ({
            personId: person.personId,
            publicationId: item.publicationId,
            quantity: item.quantity,
            shipmentId: item.shipmentId,
            requestId: item.requestId,
          })),
        }),
      });
      const delivered = { ...optimistic, deliveryIds: result.deliveries.map(d => d.id) };
      setSnack({ text: `已發給 ${person.name}`, undo: () => undo(delivered) });
      setData(current => ({
        ...current,
        delivered: current.delivered.map(p => p === optimistic ? delivered : p),
      }));
    } catch (err) {
      setData(current => restorePerson(current, previous, person.personId));
      setError(`發放失敗：${err.message}，請重試。`);
    } finally {
      finish(person.personId);
    }
  }

  async function undo(person) {
    if (person.guest) {
      const key = person.guestKey || `guest:${person.requestId}`;
      if (!begin(key)) return;
      try {
        for (const item of person.items) await request(`/api/literature/requests/${item.requestId || person.requestId}/handout`, { method: 'DELETE' });
        setSnack({ text: `已取消 ${person.name} 的發放`, undo: () => mark(person) });
      } catch (err) { setError(`取消失敗：${err.message}，請重試。`); }
      finally { finish(key); }
      return;
    }
    if (!person.deliveryIds.length || !begin(person.personId)) return;
    setError('');
    const previous = dataRef.current;
    setData(current => ({
      ...current,
      delivered: current.delivered.filter(p => p.personId !== person.personId),
      people: [...current.people, { ...person, deliveryIds: undefined }],
    }));
    try {
      await request(`/api/literature/deliveries?ids=${person.deliveryIds.join(',')}`, {
        method: 'DELETE',
      });
      setSnack({ text: `已取消 ${person.name} 的發放`, undo: () => mark(person) });
    } catch (err) {
      setData(current => restorePerson(current, previous, person.personId));
      setError(`取消失敗：${err.message}，請重試。`);
    } finally {
      finish(person.personId);
    }
  }

  async function complete(shipment) {
    if (!window.confirm(`確定將裝箱單 ${shipment.slipNumber} 的待發書刊全部標為已發？`)) return;
    try {
      await request('/api/literature/handouts/complete-shipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId: shipment.id }),
      });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (shipments) {
    return (
      <div>
        <button className="lit-back" onClick={() => { setShipments(false); load(); }}>
          <Icon name="back" /> 發放
        </button>
        <ShipmentsView items={items} request={request} reloadCatalog={reloadCatalog} />
      </div>
    );
  }

  const filtered = data.people.filter(person =>
    (group === '全部' || groupOf(person) === group) && person.name.includes(search.trim()));
  const groups = ['A', 'B', 'C', 'D', 'E'].filter(g =>
    data.people.some(person => groupOf(person) === g));
  const count = data.people.reduce((sum, person) =>
    sum + person.items.reduce((total, item) => total + item.quantity, 0), 0);

  return (
    <div className={`lit-handouts${snack ? ' lit-handouts--snack' : ''}`} style={{ '--snack-height': `${snackHeight}px` }}>
      <div className="lit-handout-heading">
        <h1>發放</h1>
        <Menu items={[{ label: '裝箱單', onSelect: () => setShipments(true) }]} />
      </div>
      <div className="lit-handout-sticky">
        <p>還有 {data.people.length} 人待發 · {count} 本</p>
        <input
          type="search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="搜尋姓名"
          aria-label="搜尋姓名"
        />
        <div className="chips lit-chips">
          {['全部', ...groups].map(g => (
            <button className="chip" key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>
              {g}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="imp-error" role="alert">{error}</div>}
      {data.olderShipments.map(shipment => {
        const date = new Date(shipment.shippedAt);
        return (
          <div className="lit-handout-notice" key={shipment.id}>
            <span>{date.getMonth() + 1}/{date.getDate()} 裝箱單還有 {shipment.pendingPeople} 人未標記</span>
            <button onClick={() => complete(shipment)}>全部標為已發</button>
          </div>
        );
      })}
      {loading ? <p className="lit-loading">正在載入發放清單…</p>
        : !data.people.length ? <p className="lit-handout-empty">都發完了。新的裝箱單到了，在 ⋯ › 裝箱單 上傳。</p>
          : !filtered.length ? <p className="lit-handout-empty">找不到符合的姓名。</p>
            : filtered.map(person => (
              <PersonRow
                key={person.guestKey || person.personId}
                person={person}
                pending={pending.has(person.guestKey || person.personId)}
                onMark={mark}
                onSelect={setSelected}
              />
            ))}
      <details className="lit-handout-delivered">
        <summary>今天已發 ({data.delivered.length})</summary>
        {data.delivered.map(person => (
          <DeliveredRow
            key={person.guestKey || person.personId}
            person={person}
            pending={pending.has(person.guestKey || person.personId)}
            onUndo={undo}
          />
        ))}
      </details>
      {selected && (
        <Sheet title={`${selected.name}的書刊`} close={() => setSelected(null)}>
          {selected.items.map(item => (
            <button
              className="lit-handout-sheet-row"
              key={item.key}
              disabled={pending.has(selected.guestKey || selected.personId)}
              aria-busy={pending.has(selected.guestKey || selected.personId) || undefined}
              onClick={() => mark(selected, [item])}
            >
              <Check />
              <PubThumb publication={items.find(p => String(p.id) === String(item.publicationId)) || item} />
              <span>{item.label}{item.quantity > 1 ? ` ×${item.quantity}` : ''}</span>
            </button>
          ))}
        </Sheet>
      )}
      {snack && <Snackbar snack={snack} onClose={() => setSnack(null)} onHeight={setSnackHeight} />}
    </div>
  );
}
