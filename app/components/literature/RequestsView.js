'use client';
import { useCallback, useEffect, useState } from 'react';
import { matchPublications } from '../../lib/literature.mjs';
import PubThumb, { GROUPS, LANGUAGES, SERIES, Sheet, groupOf, sameId, seriesPublication } from './PubThumb';

const STATUS = { pending: '待訂', ordered: '已訂', received: '已到', delivered: '已發', cancelled: '已取消' };
const open = (item) => ['pending', 'ordered', 'received'].includes(item.status);
const json = (method, data) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });

export default function RequestsView({ people, items, request }) {
  const [data, setData] = useState({ subscriptions: [], requests: [] });
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [person, setPerson] = useState(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({});
  const [personQuery, setPersonQuery] = useState('');
  const [pubQuery, setPubQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await request('/api/literature/requests'));
      setError('');
    } catch (err) { setError(err.message); }
  }, [request]);
  useEffect(() => { load(); }, [load]);
  const subscriptionsFor = (id) => data.subscriptions.filter((s) => sameId(s.personId, id));
  const requestsFor = (id) => data.requests.filter((r) => sameId(r.personId, id) && open(r));
  const publication = (id) => items.find((p) => sameId(p.id, id));
  function add(selected) {
    setError('');
    setPersonQuery(selected?.name || '');
    setPubQuery('');
    setForm({ personId: selected?.id || '', type: 'subscription', series: 'w', language: 'CHT', quantity: 1, note: '', publicationId: '' });
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
    } finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault();
    const payload = { ...form, quantity: Number(form.quantity) };
    const path = form.type === 'subscription' ? 'subscriptions' : 'requests';
    if (await mutate(`/api/literature/${path}`, json('POST', payload))) setAdding(false);
  }
  const active = data.subscriptions.filter((s) => s.active);
  const summary = Object.keys(SERIES).map((series) => {
    const totals = Object.keys(LANGUAGES).map((language) => {
      const total = active.filter((s) => s.series === series && s.language === language).reduce((sum, s) => sum + s.quantity, 0);
      return total ? `${{ CHT: '中', ENG: '英', JPN: '日' }[language]} ${total}` : null;
    }).filter(Boolean);
    return totals.length ? `${SERIES[series]} ${totals.join(' · ')}` : null;
  }).filter(Boolean);
  return (
    <div>
      <div className="lit-header"><h1>書刊申請</h1><button className="btn btn--primary" onClick={() => add(null)}>＋新增申請</button></div>
      <div className="lit-summary">定期總數：{summary.join(' ｜ ') || '尚無定期申請'}</div>
      <div className="lit-controls">
        <input className="field__input" placeholder="搜尋人員姓名" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="lit-check"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> 顯示全部人員</label>
      </div>
      {error && <div className="imp-error" role="alert">{error}</div>}
      {GROUPS.map((group) => {
        const members = people.filter((p) => groupOf(p) === group && p.name.includes(query.trim()) && (showAll || subscriptionsFor(p.id).some((s) => s.active) || requestsFor(p.id).length));
        if (!members.length) return null;
        return <section key={group}><h2 className="lit-category">{group === '未分組' ? group : `服務小組 ${group}`}</h2><div className="lit-person-grid">
          {members.map((p) => <article className="lit-person-card" key={p.id}>
            <button className="lit-person-main" onClick={() => { setError(''); setPerson(p); }}>
              <strong>{p.name} <span className="lit-badge">{group === '未分組' ? group : `${group} 組`}</span></strong>
              <span className="lit-thumb-row">
                {subscriptionsFor(p.id).filter((s) => s.active).map((s) => <span className="lit-item" key={`s${s.id}`}><PubThumb publication={seriesPublication(items, s.series, s.language)} code={s.series} name={SERIES[s.series]} /><span className="lit-badge">定期 ×{s.quantity}</span>{s.language !== 'CHT' && <span className="lit-badge">{LANGUAGES[s.language] || s.language}</span>}</span>)}
                {requestsFor(p.id).map((r) => <span className="lit-item" key={`r${r.id}`}><PubThumb publication={publication(r.publicationId)} /><span className="lit-badge">{STATUS[r.status]} ×{r.quantity}</span></span>)}
              </span>
            </button>
            <button className="btn btn--sm" onClick={() => add(p)}>＋新增</button>
          </article>)}
        </div></section>;
      })}
      {person && !adding && <Sheet title={person.name} close={() => setPerson(null)}>
        <button className="btn btn--primary" onClick={() => add(person)}>＋新增</button>
        <h3>定期</h3>
        {subscriptionsFor(person.id).map((s) => <div className="lit-edit-row" key={s.id}>
          <strong>{SERIES[s.series]} · {LANGUAGES[s.language] || s.language}</strong>
          <label>數量 <input className="field__input lit-number" type="number" min="1" defaultValue={s.quantity} key={`${s.id}-${s.quantity}`} onBlur={(e) => { const quantity = Number(e.target.value); if (quantity > 0 && quantity !== s.quantity) mutate(`/api/literature/subscriptions/${s.id}`, json('PATCH', { quantity })); }} /></label>
          <label><input type="checkbox" checked={s.active} disabled={busy} onChange={(e) => mutate(`/api/literature/subscriptions/${s.id}`, json('PATCH', { active: e.target.checked }))} /> 啟用</label>
          <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => { if (window.confirm('確定刪除這項定期申請？')) mutate(`/api/literature/subscriptions/${s.id}`, { method: 'DELETE' }); }}>刪除</button>
        </div>)}
        <h3>單次申請</h3>
        {requestsFor(person.id).map((r) => <div className="lit-edit-row" key={r.id}>
          <strong>{publication(r.publicationId)?.name || '書刊'} ×{r.quantity}</strong>
          <select className="field__input" value={r.status} disabled={busy} onChange={(e) => mutate(`/api/literature/requests/${r.id}`, json('PATCH', { status: e.target.value }))}>{Object.entries(STATUS).filter(([key]) => key !== 'cancelled').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
          <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => { if (window.confirm('確定取消這項申請？')) mutate(`/api/literature/requests/${r.id}`, { method: 'DELETE' }); }}>取消申請</button>
        </div>)}
        {error && <div className="imp-error">{error}</div>}
      </Sheet>}
      {adding && <Sheet title="新增申請" close={() => setAdding(false)}><form className="lit-form" onSubmit={save}>
        <label className="field"><span className="field__label">人員</span><input className="field__input" placeholder="搜尋姓名" value={personQuery} onChange={(e) => { setPersonQuery(e.target.value); setForm({ ...form, personId: '' }); }} /></label>
        {!form.personId && <div className="lit-picker">{people.filter((p) => p.name.includes(personQuery.trim())).map((p) => <button type="button" key={p.id} onClick={() => { setForm({ ...form, personId: p.id }); setPersonQuery(p.name); }}>{p.name} · {groupOf(p)}</button>)}</div>}
        <label className="field"><span className="field__label">類型</span><select className="field__input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="subscription">定期</option><option value="request">單次</option></select></label>
        {form.type === 'subscription' ? <>
          <label className="field"><span className="field__label">系列</span><select className="field__input" value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })}>{Object.entries(SERIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="field"><span className="field__label">語言</span><select className="field__input" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>{Object.entries(LANGUAGES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </> : <><label className="field"><span className="field__label">書刊</span><input className="field__input" placeholder="搜尋書刊" value={pubQuery} onChange={(e) => { setPubQuery(e.target.value); setForm({ ...form, publicationId: '' }); }} /></label>{!form.publicationId && pubQuery && <div className="lit-picker lit-pub-picker">{matchPublications(pubQuery, items).map((p) => <button type="button" key={p.id} onClick={() => { setForm({ ...form, publicationId: p.id }); setPubQuery(p.name); }}><PubThumb publication={p} /></button>)}</div>}</>}
        <label className="field"><span className="field__label">數量</span><input className="field__input" type="number" min="1" required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></label>
        <label className="field"><span className="field__label">備註</span><input className="field__input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
        {error && <div className="imp-error">{error}</div>}
        <button className="btn btn--primary" disabled={busy || !form.personId || (form.type === 'request' && !form.publicationId)}>{busy ? '儲存中…' : '儲存'}</button>
      </form></Sheet>}
    </div>
  );
}
