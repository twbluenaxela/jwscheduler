'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildChecklist, applyCheck, applyUncheck, pendingStats } from '../../lib/handoutChecklist.mjs';
import Icon from './Icon';
import Menu from './Menu';
import PubThumb, { groupOf } from './PubThumb';
import ShipmentsView from './ShipmentsView';

function CoverStrip({ person, items }) {
  return (
    <span className="lit-check-stack" aria-hidden="true">
      {person.items.slice(0, 3).map((item, index) => (
        <PubThumb
          key={item.key || index}
          publication={items.find((publication) => String(publication.id) === String(item.publicationId)) || item}
        />
      ))}
    </span>
  );
}

function HandoutCard({ person, items, open, onToggle, onToggleItem, onCheckAll, pendingKeys }) {
  const unchecked = person.items.filter((item) => !item.checked);
  const busy = (item) => pendingKeys.has(`${person.key}:${item.key}`);
  return (
    <article className={`lit-check-card${open ? ' is-open' : ''}${person.done ? ' is-done' : ''}`}>
      <button className="lit-check-head" aria-expanded={open} onClick={onToggle}>
        <CoverStrip person={person} items={items} />
        <span className="lit-check-person">
          <strong>{person.name}</strong>
          {(person.guest || person.items.some((item) => item.source === 'request') || person.items.some((item) => item.short)) && (
            <span className="lit-check-meta">
              {person.items.some((item) => item.source === 'request') && <span>單次</span>}
              {person.items.some((item) => item.short) && <span className="lit-short">不足</span>}
              {person.guest && <small className="lit-badge">名單外</small>}
            </span>
          )}
        </span>
        {person.done ? (
          <span className="lit-check-delivered">
            <Icon name="check" />
            <time>
              {new Date(person.deliveredAt).toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: 'Asia/Taipei',
              })}
            </time>
          </span>
        ) : (
          <span className={`lit-check-progress${person.checkedCount > 0 ? ' is-partial' : ''}`}>
            {person.checkedCount}/{person.total}
          </span>
        )}
        <span className="lit-check-chevron" aria-hidden="true">
          <Icon name="chevronRight" />
        </span>
      </button>
      {open && (
        <div className="lit-check-body">
          {person.items.map((item, index) => (
            <button
              type="button"
              role="checkbox"
              aria-checked={item.checked}
              aria-busy={busy(item) || undefined}
              disabled={busy(item)}
              className={`lit-check-item${index === person.items.length - 1 ? ' is-last' : ''}`}
              key={item.key}
              onClick={() => onToggleItem(person, item)}
            >
              <span className={`lit-check-box${item.checked ? ' is-checked' : ''}`} aria-hidden="true">
                {item.checked && <Icon name="check" />}
              </span>
              <PubThumb
                publication={items.find((publication) => String(publication.id) === String(item.publicationId)) || item}
              />
              <span className={`lit-check-label${item.checked ? ' is-checked' : ''}`}>
                <span>{item.label}</span>
                {item.quantity > 1 && (
                  <span className="lit-check-quantity">×{item.quantity}</span>
                )}
                {item.short && <small className="lit-short">不足</small>}
              </span>
              <span className="sr-only">{item.checked ? '取消' : '標記'}{item.label}</span>
            </button>
          ))}
          {unchecked.length > 0 && (
            <button
              className="lit-check-all"
              disabled={unchecked.some(busy)}
              onClick={() => onCheckAll(person, unchecked)}
            >
              全部勾選（{unchecked.length} 項）
            </button>
          )}
        </div>
      )}
    </article>
  );
}

export default function HandoutView({ items, request, reloadCatalog }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('全部');
  const [openKey, setOpenKey] = useState(null);
  const [shipments, setShipments] = useState(false);
  const [pendingKeys, setPendingKeys] = useState(new Set());
  const pendingRef = useRef(new Set());
  const listRef = useRef(list);
  listRef.current = list;
  const revision = useRef(0);

  const load = useCallback(async () => {
    const startedAt = revision.current;
    try {
      const result = await request('/api/literature/handouts');
      if (startedAt === revision.current && pendingRef.current.size === 0) {
        const next = buildChecklist(result);
        setList(next);
        listRef.current = next;
        setOpenKey((current) => (
          next.some((entry) => entry.key === current && entry.done) ? null : current
        ));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [request]);
  useEffect(() => { load(); }, [load]);

  function begin(tokens) {
    if (tokens.some((token) => pendingRef.current.has(token))) return false;
    tokens.forEach((token) => pendingRef.current.add(token));
    revision.current++;
    setPendingKeys(new Set(pendingRef.current));
    return true;
  }
  function finish(tokens) {
    tokens.forEach((token) => pendingRef.current.delete(token));
    setPendingKeys(new Set(pendingRef.current));
    if (pendingRef.current.size === 0) load();
  }
  const update = (next) => {
    listRef.current = next;
    setList(next);
  };

  async function toggleItems(person, chosen, checked) {
    const tokens = chosen.map((item) => `${person.key}:${item.key}`);
    if (chosen.some((item) => (
      checked && item.checked
      || !checked && (!item.checked || !person.guest && !item.deliveryId)
    ))) return;
    if (!begin(tokens)) return;
    setError('');
    const before = listRef.current;
    if (checked) {
      const next = applyCheck(before, person.key, chosen.map((item) => item.key), {
        at: new Date().toISOString(),
      });
      update(next);
      if (next.find((entry) => entry.key === person.key)?.done) setOpenKey(null);
    } else {
      update(applyUncheck(before, person.key, chosen.map((item) => item.key)));
    }
    try {
      if (person.guest) {
        for (const item of chosen) {
          await request(`/api/literature/requests/${item.requestId || person.requestId}/handout`, {
            method: checked ? 'POST' : 'DELETE',
          });
        }
      } else if (checked) {
        const result = await request('/api/literature/deliveries', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: chosen.map((item) => ({
              personId: person.personId,
              publicationId: item.publicationId,
              quantity: item.quantity,
              shipmentId: item.shipmentId,
              requestId: item.requestId,
            })),
          }),
        });
        update(applyCheck(listRef.current, person.key, chosen.map((item) => item.key), {
          deliveryIds: result.deliveries.map((delivery) => delivery.id),
          at: new Date().toISOString(),
        }));
      } else {
        await request(
          `/api/literature/deliveries?ids=${chosen.map((item) => item.deliveryId).join(',')}`,
          { method: 'DELETE' },
        );
      }
    } catch (err) {
      update(checked
        ? applyUncheck(listRef.current, person.key, chosen.map((item) => item.key))
        : applyCheck(listRef.current, person.key, chosen.map((item) => item.key), {
          deliveryIds: chosen.map((item) => item.deliveryId),
        }));
      setError(`${checked ? '發放失敗' : '取消失敗'}：${err.message}，請重試。`);
    } finally {
      finish(tokens);
    }
  }

  async function complete(shipment) {
    if (!window.confirm(`確定將裝箱單 ${shipment.slipNumber} 的待發書刊全部標為已發？`)) {
      return;
    }
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

  const pending = list.filter((person) => !person.done);
  const delivered = list.filter((person) => person.done);
  const filtered = pending.filter((person) => (
    (group === '全部' || groupOf(person) === group) && person.name.includes(search.trim())
  ));
  const groups = ['A', 'B', 'C', 'D', 'E'].filter((g) => pending.some((person) => groupOf(person) === g));
  const stats = pendingStats(list);
  return (
    <div className="lit-handouts">
      <div className="lit-handout-heading">
        <h1>發放</h1>
        <Menu items={[{ label: '裝箱單', onSelect: () => setShipments(true) }]} />
      </div>
      <div className="lit-handout-sticky">
        <p>還有 {stats.people} 人待發 · {stats.quantity} 本</p>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜尋姓名"
          aria-label="搜尋姓名"
        />
        <div className="chips lit-chips">
          {['全部', ...groups].map((groupName) => (
            <button
              className="chip"
              key={groupName}
              aria-pressed={group === groupName}
              onClick={() => setGroup(groupName)}
            >
              {groupName}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="imp-error" role="alert">{error}</div>}
      {loading ? (
        <p className="lit-loading">正在載入發放清單…</p>
      ) : !pending.length ? (
        <p className="lit-handout-empty">都發完了。新的裝箱單到了，在 ⋯ › 裝箱單 上傳。</p>
      ) : !filtered.length ? (
        <p className="lit-handout-empty">找不到符合的姓名。</p>
      ) : filtered.map((person) => (
        <HandoutCard
          key={person.key}
          person={person}
          items={items}
          open={openKey === person.key}
          onToggle={() => setOpenKey(openKey === person.key ? null : person.key)}
          onToggleItem={(entry, item) => toggleItems(entry, [item], !item.checked)}
          onCheckAll={(entry, unchecked) => toggleItems(entry, unchecked, true)}
          pendingKeys={pendingKeys}
        />
      ))}
      <details className="lit-handout-delivered">
        <summary>今天已發 ({delivered.length})</summary>
        {delivered.map((person) => (
          <HandoutCard
            key={person.key}
            person={person}
            items={items}
            open={openKey === person.key}
            onToggle={() => setOpenKey(openKey === person.key ? null : person.key)}
            onToggleItem={(entry, item) => toggleItems(entry, [item], !item.checked)}
            onCheckAll={(entry, unchecked) => toggleItems(entry, unchecked, true)}
            pendingKeys={pendingKeys}
          />
        ))}
      </details>
    </div>
  );
}
