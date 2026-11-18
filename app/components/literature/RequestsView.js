'use client';
import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import Menu from './Menu';
import FormLinkSheet from './FormLinkSheet';
import OrderList from './OrderList';
import { matchPublications } from '../../lib/literature.mjs';
import { localizedName } from '../../lib/publicForm.mjs';
import PubThumb, { GROUPS, LANGUAGES, SERIES, Sheet, groupOf, issueLabel, sameId, seriesPublication } from './PubThumb';

const STATUS = { pending: '待訂', ordered: '已訂', received: '已到', delivered: '已發', cancelled: '已取消' };
const open = (item) => ['pending', 'ordered', 'received'].includes(item.status);
const json = (method, data) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

function GuestGroup({ requests, query, publication, select }) {
  const guests = requests.filter((r) => !r.personId && open(r) && (r.guestName || '').includes(query.trim()));
  const names = [...new Set(guests.map((r) => r.guestName))];
  if (!names.length) return null;
  return (
    <section>
      <h2 className="lit-category">名單外</h2>
      <div className="lit-grid">
        {names.map((name) => (
          <button key={name} className="lit-person-card lit-guest-card" onClick={() => select(name)}>
            <span className="lit-person-content">
              <strong>{name}</strong>
              <span>
                {guests
                  .filter((r) => r.guestName === name)
                  .map((r) => `${publication(r.publicationId)?.name || '書刊'} ×${r.quantity}`)
                  .join(' · ')}
              </span>
              <small>{guests.find((r) => r.guestName === name)?.guestNote}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function GuestRequestsSheet({ name, requests, people, publication, mutate, setSnack, close }) {
  const guestRequests = requests.filter((r) => !r.personId && r.guestName === name && open(r));
  async function archive(row) {
    if (await mutate(`/api/literature/requests/${row.id}`, json('PATCH', { status: 'cancelled' }))) {
      setSnack({ id: row.id, status: row.status });
    }
  }
  return (
    <Sheet title={name} close={close}>
      {guestRequests.map((row) => (
        <div className="lit-review-row lit-review-row--guest" key={row.id}>
          <PubThumb publication={publication(row.publicationId)} />
          <div className="lit-guest-review-content">
          <strong>
            {publication(row.publicationId)?.name} ×{row.quantity}
          </strong>
          <span>{row.guestNote}</span>
          <button className="btn" onClick={() => archive(row)}>
            封存
          </button>
          <label>
            指定給名單中的人{' '}
            <select
              className="field__input"
              value=""
              onChange={(event) => {
                if (event.target.value) {
                  mutate(`/api/literature/requests/${row.id}`, json('PATCH', { personId: event.target.value }));
                }
              }}
            >
              <option value="">選擇人員</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          </div>
        </div>
      ))}
    </Sheet>
  );
}

export default function RequestsView({ people, items, request, formSeen, newFormCount, markFormsSeen }) {
  const [data, setData] = useState({ subscriptions: [], requests: [] });
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [person, setPerson] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({});
  const [personQuery, setPersonQuery] = useState('');
  const [pubQuery, setPubQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [sheetSeen, setSheetSeen] = useState(null);
  function openLink() {
    setSheetSeen(formSeen);
    markFormsSeen();
    setLinkOpen(true);
  }
  const [guestName, setGuestName] = useState(null);
  const [snack, setSnack] = useState(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderData, setOrderData] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [notes, setNotes] = useState({});
  const [noteSaved, setNoteSaved] = useState(false);
  useEffect(() => {
    if (snack) {
      const timer = setTimeout(() => setSnack(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [snack]);
  const load = useCallback(async () => {
    try {
      setData(await request('/api/literature/requests'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [request]);
  useEffect(() => {
    load();
  }, [load]);
  const loadOrders = useCallback(async () => {
    setOrderLoading(true);
    try {
      setOrderData(await request('/api/literature/order-list'));
      setOrderError('');
    } catch (err) {
      setOrderError(err.message);
    } finally {
      setOrderLoading(false);
    }
  }, [request]);
  useEffect(() => {
    loadOrders();
  }, [loadOrders, data]);
  async function markOrders(rows, status) {
    setBusy(true);
    try {
      const result = await request('/api/literature/order-list/mark', json('POST', {
        requestIds: rows.map((row) => row.requestId),
        status,
      }));
      await load();
      await loadOrders();
      if (result.requestIds.length && status !== 'pending') setSnack({ ids: result.requestIds, label: status === 'ordered' ? '已訂' : '已到' });
    } catch (err) {
      setOrderError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const subscriptionsFor = (id) => data.subscriptions.filter((s) => sameId(s.personId, id));
  const requestsFor = (id) => data.requests.filter((r) => sameId(r.personId, id) && open(r));
  const publication = (id) => {
    const p = items.find((row) => sameId(row.id, id));
    return p && { ...p, name: localizedName(p, items) };
  };
  function add(selected) {
    setError('');
    setPersonQuery(selected?.name || '');
    setPubQuery('');
    setForm({
      personId: selected?.id || '',
      type: 'subscription',
      series: 'w',
      language: 'CHT',
      quantity: 1,
      note: '',
      publicationId: '',
    });
    setAdding(true);
  }
  async function mutate(path, init) {
    setBusy(true);
    setError('');
    try {
      await request(path, init);
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function save(event) {
    event.preventDefault();
    const payload = { ...form, quantity: Number(form.quantity) };
    const path = form.type === 'subscription' ? 'subscriptions' : 'requests';
    if (await mutate(`/api/literature/${path}`, json('POST', payload))) setAdding(false);
  }
  function updateNote(id, value) {
    setNotes((current) => ({ ...current, [id]: value || '' }));
  }
  async function savePersonNote(value) {
    try {
      const result = await request(`/api/literature/people/${person.id}/note`, json('PATCH', { note: value }));
      updateNote(person.id, result.literatureNote);
      setNoteSaved(true);
    } catch (err) {
      setError(err.message);
    }
  }
  const visiblePeople = people.filter(
    (p) => p.name.includes(query.trim()) && (subscriptionsFor(p.id).some((s) => s.active) || requestsFor(p.id).length),
  );
  return (
    <div>
      {newFormCount > 0 && (
        <button className="lit-new-submissions" onClick={openLink}>
          {newFormCount} 筆新申請
          <Icon name="chevronRight" />
        </button>
      )}
      {orderData && (orderData.toOrder.length > 0 || orderData.fromStock.length > 0) && (
        <button className="lit-order-summary" onClick={() => setOrderOpen(true)}>
          <span>訂購清單 · 要訂 {orderData.toOrder.length} 項 · {orderData.toOrder.reduce((sum, row) => sum + row.order, 0)} 本</span>
          <Icon name="chevronRight" />
        </button>
      )}
      <div className="lit-search">
        <input
          className="field__input"
          placeholder="搜尋人員姓名"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Menu items={[{ label: '訂購清單', onSelect: () => setOrderOpen(true) }, { label: '申請連結（給大家用的表單）', onSelect: openLink }]} />
        <button className="btn btn--primary lit-add" aria-label="新增申請" onClick={() => add(null)}>
          ＋
        </button>
      </div>
      {error && (
        <div className="imp-error" role="alert">
          {error}
        </div>
      )}
      {!visiblePeople.length && <p>{query.trim() ? `找不到「${query.trim()}」` : '還沒有申請。按 ＋ 新增。'}</p>}
      {GROUPS.map((group) => {
        const members = visiblePeople.filter((p) => groupOf(p) === group);
        if (!members.length) return null;
        return (
          <section key={group}>
            <h2 className="lit-category">
              {group === '未分組' ? group : `${group} 組`} · {members.length} 人
            </h2>
            <div className="lit-grid">
              {members.map((p) => {
                const subs = subscriptionsFor(p.id).filter((s) => s.active);
                const requests = requestsFor(p.id);
                const first = subs[0];
                const cover =
                  (first && seriesPublication(items, first.series, first.language)) ||
                  publication(requests[0]?.publicationId);
                const groups = new Map();
                subs.forEach((subscription) => {
                  if (!groups.has(subscription.series)) groups.set(subscription.series, new Set());
                  groups.get(subscription.series).add(subscription.language);
                });
                const labels = { w: '研讀版', wlp: '大字研讀版', mwb: '手冊', es: '天天查考' };
                const languages = { CHT: '中', ENG: '英', JPN: '日' };
                const summary = [...groups].map(([series, values]) => {
                  const name =
                    labels[series] ||
                    SERIES[series] ||
                    seriesPublication(items, series, [...values][0])?.name ||
                    series;
                  const suffix =
                    values.size > 1 || !values.has('CHT')
                      ? ` ${[...values].map((value) => languages[value] || value).join('/')}`
                      : '';
                  return name + suffix;
                });
                return (
                  <button
                    className="lit-person-card"
                    key={p.id}
                    onClick={() => {
                      setError('');
                      setPerson(p);
                      setNoteSaved(false);
                    }}
                  >
                    {cover && <PubThumb publication={cover} />}
                    <span className="lit-person-content">
                      <span className="lit-person-name">
                        {p.name} {p.groupRole && <small>{p.groupRole === 'overseer' ? '小組監督' : '助手'}</small>}
                        {(notes[p.id] ?? p.literatureNote) && <span className="lit-note-icon" role="img" aria-label="有備註"><Icon name="note" /></span>}
                        {requests.some((r) => r.status === 'pending') && <span className="lit-pending-dot" />}
                      </span>
                      {summary.length > 0 && (
                        <span className="lit-person-summary">
                          {summary.map((item, index) => (
                            <span key={item}>
                              {index > 0 && ' · '}
                              <span className="lit-person-summary-item">{item}</span>
                            </span>
                          ))}
                        </span>
                      )}
                      {requests.length > 0 && <span className="lit-person-tag">單次 {requests.length}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
      <GuestGroup requests={data.requests} query={query} publication={publication} select={setGuestName} />
      {guestName && (
        <GuestRequestsSheet
          name={guestName}
          requests={data.requests}
          people={people}
          publication={publication}
          mutate={mutate}
          setSnack={setSnack}
          close={() => setGuestName(null)}
        />
      )}
      {orderOpen && <OrderList data={orderData} loading={orderLoading} error={orderError} reload={loadOrders} close={() => setOrderOpen(false)} mark={markOrders} busy={busy} />}
      {linkOpen && <FormLinkSheet request={request} close={() => setLinkOpen(false)} onNoteSaved={updateNote} seenAt={sheetSeen} />}
      {snack && (
        <div className="lit-handout-snack" role="status">
          {snack.ids ? `已標 ${snack.ids.length} 筆為${snack.label}` : '已封存'}{' '}
          <button
            onClick={() => {
              if (snack.ids) {
                markOrders(snack.ids.map((requestId) => ({ requestId })), 'pending');
              } else {
                mutate(`/api/literature/requests/${snack.id}`, json('PATCH', { status: snack.status }));
              }
              setSnack(null);
            }}
          >
            復原
          </button>
        </div>
      )}
      {person && !adding && (
        <Sheet title={person.name} close={() => setPerson(null)}>
          <label className="field lit-person-note">
            <span className="field__label">書刊備註 {noteSaved && <small role="status">已儲存</small>}</span>
            <textarea className="field__input" rows={2} maxLength={1000}
              ref={(element) => {
                if (element) {
                  element.style.height = 'auto';
                  element.style.height = `${element.scrollHeight}px`;
                }
              }}
              value={notes[person.id] ?? person.literatureNote ?? ''}
              onChange={(event) => {
                updateNote(person.id, event.target.value);
                setNoteSaved(false);
                event.target.style.height = 'auto';
                event.target.style.height = `${event.target.scrollHeight}px`;
              }}
              onFocus={(event) => {
                event.target.style.height = 'auto';
                event.target.style.height = `${event.target.scrollHeight}px`;
              }}
              onBlur={(event) => savePersonNote(event.target.value)} />
          </label>
          {subscriptionsFor(person.id).length > 0 && <h3 className="lit-review-heading">定期</h3>}
          {subscriptionsFor(person.id).map((s) => (
            <div className={`lit-review-row${s.active ? '' : ' is-inactive'}`} key={s.id}>
              <PubThumb
                publication={seriesPublication(items, s.series, s.language)}
                code={s.series}
                language={s.language}
              />
              <div className="lit-review-content">
                <strong className="lit-review-name">
                  {SERIES[s.series]} · {LANGUAGES[s.language] || s.language}
                </strong>
                <div className="lit-review-controls">
                  <label className="lit-review-quantity">
                    數量
                    <input
                      className="field__input lit-number"
                      type="number"
                      min="1"
                      defaultValue={s.quantity}
                      key={`${s.id}-${s.quantity}`}
                      onBlur={(e) => {
                        const quantity = Number(e.target.value);
                        if (quantity > 0 && quantity !== s.quantity)
                          mutate(`/api/literature/subscriptions/${s.id}`, json('PATCH', { quantity }));
                      }}
                    />
                  </label>
                  <label className="lit-review-active">
                    <input
                      type="checkbox"
                      checked={s.active}
                      disabled={busy}
                      onChange={(e) =>
                        mutate(`/api/literature/subscriptions/${s.id}`, json('PATCH', { active: e.target.checked }))
                      }
                    />
                    啟用
                  </label>
                  <Menu items={[{
                    label: '刪除',
                    danger: true,
                    onSelect: () => {
                      if (!busy && window.confirm('確定刪除這項定期申請？'))
                        mutate(`/api/literature/subscriptions/${s.id}`, { method: 'DELETE' });
                    },
                  }]} />
                </div>
              </div>
            </div>
          ))}
          {requestsFor(person.id).length > 0 && <h3 className="lit-review-heading">單次申請</h3>}
          {requestsFor(person.id).map((r) => {
            const pub = publication(r.publicationId);
            const details = [pub?.code, pub?.code && issueLabel(pub.code)].filter(Boolean).join(' · ');
            return (
              <div className="lit-review-row" key={r.id}>
                <PubThumb publication={pub} />
                <div className="lit-review-content">
                  <div className="lit-review-text">
                    <strong className="lit-review-name">{pub?.name || '書刊'}</strong>
                    <span className="lit-review-meta">
                      {details}{details && ' '}×{r.quantity} {r.source === 'form' && <small className="lit-badge">表單</small>}
                    </span>
                  </div>
                  <div className="lit-review-controls">
                    <select
                      className="field__input"
                      value={r.status}
                      disabled={busy}
                      aria-label={`${pub?.name || '書刊'}狀態`}
                      onChange={(e) => mutate(`/api/literature/requests/${r.id}`, json('PATCH', { status: e.target.value }))}
                    >
                      {Object.entries(STATUS)
                        .filter(([key]) => key !== 'cancelled')
                        .map(([key, label]) => (
                          <option key={key} value={key}>{label}</option>
                        ))}
                    </select>
                    <Menu items={[
                      {
                        label: '封存',
                        onSelect: async () => {
                          if (await mutate(`/api/literature/requests/${r.id}`, json('PATCH', { status: 'cancelled' })))
                            setSnack({ id: r.id, status: r.status });
                        },
                      },
                      {
                        label: '取消申請',
                        danger: true,
                        onSelect: () => {
                          if (!busy && window.confirm('確定取消這項申請？'))
                            mutate(`/api/literature/requests/${r.id}`, { method: 'DELETE' });
                        },
                      },
                    ]} />
                  </div>
                </div>
              </div>
            );
          })}
          {!subscriptionsFor(person.id).length && !requestsFor(person.id).length && (
            <p className="lit-review-empty">還沒有申請</p>
          )}
          <button className="btn lit-review-add" onClick={() => add(person)}>
            ＋新增
          </button>
          {error && <div className="imp-error">{error}</div>}
        </Sheet>
      )}
      {adding && (
        <Sheet title="新增申請" close={() => setAdding(false)}>
          <form className="lit-form" onSubmit={save}>
            <label className="field">
              <span className="field__label">人員</span>
              <input
                className="field__input"
                placeholder="搜尋姓名"
                value={personQuery}
                onChange={(e) => {
                  setPersonQuery(e.target.value);
                  setForm({ ...form, personId: '' });
                }}
              />
            </label>
            {!form.personId && (
              <div className="lit-picker">
                {people
                  .filter((p) => p.name.includes(personQuery.trim()))
                  .map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        setForm({ ...form, personId: p.id });
                        setPersonQuery(p.name);
                      }}
                    >
                      {p.name} · {groupOf(p)}
                    </button>
                  ))}
              </div>
            )}
            <label className="field">
              <span className="field__label">類型</span>
              <select
                className="field__input"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="subscription">定期</option>
                <option value="request">單次</option>
              </select>
            </label>
            {form.type === 'subscription' ? (
              <>
                <label className="field">
                  <span className="field__label">系列</span>
                  <select
                    className="field__input"
                    value={form.series}
                    onChange={(e) => setForm({ ...form, series: e.target.value })}
                  >
                    {Object.entries(SERIES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span className="field__label">語言</span>
                  <select
                    className="field__input"
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                  >
                    {Object.entries(LANGUAGES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label className="field">
                  <span className="field__label">書刊</span>
                  <input
                    className="field__input"
                    placeholder="搜尋書刊"
                    value={pubQuery}
                    onChange={(e) => {
                      setPubQuery(e.target.value);
                      setForm({ ...form, publicationId: '' });
                    }}
                  />
                </label>
                {!form.publicationId && pubQuery && (
                  <div className="lit-picker lit-pub-picker">
                    {matchPublications(pubQuery, items.filter((p) => !['w', 'mwb', 'wlp'].includes(p.code))).map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => {
                          setForm({ ...form, publicationId: p.id });
                          setPubQuery(localizedName(p, items));
                        }}
                      >
                        <PubThumb publication={p} />
                        <span>
                          {localizedName(p, items)} · {issueLabel(p.code)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
            <label className="field">
              <span className="field__label">數量</span>
              <input
                className="field__input"
                type="number"
                min="1"
                required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field__label">備註</span>
              <input
                className="field__input"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </label>
            {error && <div className="imp-error">{error}</div>}
            <button
              className="btn btn--primary"
              disabled={busy || !form.personId || (form.type === 'request' && !form.publicationId)}
            >
              {busy ? '儲存中…' : '儲存'}
            </button>
          </form>
        </Sheet>
      )}
    </div>
  );
}
