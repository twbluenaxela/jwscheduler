'use client';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { matchPublications, withCoverFallback } from '../../lib/literature.mjs';
import { PUBLIC_SECTIONS, MAGAZINE_TABS, defaultKind, editionGroups } from '../../lib/publicForm.mjs';
import PubThumb, { Sheet } from './PubThumb';
import Icon from './Icon';

function Stepper({ value, onChange }) {
  return (
    <div className="public-stepper">
      <button type="button" aria-label="減少數量" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span key={value} className="public-tick">
        {value}
      </span>
      <button type="button" aria-label="增加數量" disabled={value >= 20} onClick={() => onChange(value + 1)}>
        ＋
      </button>
    </div>
  );
}

function GuestSheet({ close, choose }) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  function submit(event) {
    event.preventDefault();
    choose({ name: name.trim(), note: note.trim(), guest: true });
  }
  return (
    <Sheet title="名單上沒有我的名字" close={close}>
      <form className="lit-form" onSubmit={submit}>
        <label className="field">
          <span className="field__label">名字</span>
          <input
            className="field__input"
            required
            maxLength={30}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">備註（選填）</span>
          <input
            className="field__input"
            maxLength={200}
            placeholder="例如：誰介紹你、怎麼聯絡你"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <button className="btn btn--primary" disabled={!name.trim()}>
          繼續
        </button>
      </form>
    </Sheet>
  );
}

function NameStep({ groups, person, query, setQuery, choose, openGuest }) {
  return (
    <div className="public-content">
      <h1>你是誰？</h1>
      <input
        className="field__input"
        type="search"
        placeholder="搜尋名字"
        aria-label="搜尋名字"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {groups.map((group) => {
        const names = group.people.filter((p) => p.name.includes(query.trim()));
        if (!names.length) return null;
        return (
          <section key={group.group}>
            <h2 className="lit-category">{group.group === '未分組' ? group.group : `${group.group} 組`}</h2>
            <div className="public-names">
              {names.map((p) => (
                <button
                  key={p.id}
                  style={person?.id === p.id ? { viewTransitionName: 'chosen-person' } : undefined}
                  onClick={(e) => {
                    e.currentTarget.style.viewTransitionName = 'chosen-person';
                    choose(p);
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </section>
        );
      })}
      <button className="btn public-guest" onClick={openGuest}>
        名單上沒有我的名字
      </button>
    </div>
  );
}

function CatalogStep({ publications, cart, query, setQuery, view, setView, section, setSection, sub, setSub, openItem }) {
  const searching = Boolean(query.trim());
  const sections = PUBLIC_SECTIONS.filter((entry) => publications.some((p) => p.section === entry.key));
  const tabs = MAGAZINE_TABS.filter((tab) => publications.some((p) => p.section === 'magazines' && p.sub === tab.key));
  const currentSub = tabs.some((tab) => tab.key === sub) ? sub : tabs[0]?.key;
  const candidates = searching ? publications : publications.filter((p) => (
    p.section === section && (section !== 'magazines' || p.sub === currentSub)
  ));
  const flat = matchPublications(query, candidates, { limit: publications.length });
  if (!searching && section === 'magazines') {
    const issueNumber = (item) => {
      const match = /(\d{2})\.(\d{1,2})$/.exec(item.code);
      return match ? Number(match[1]) * 100 + Number(match[2]) : 0;
    };
    flat.sort((a, b) => issueNumber(b) - issueNumber(a));
  }
  const filtered = editionGroups(flat, publications);
  function changeView(value) {
    setView(value);
    try {
      localStorage.setItem('litform:view', value);
    } catch {}
  }
  const showItems = searching || section;
  return (
    <>
      <div className="public-toolbar">
        <h1>選書刊</h1>
        <input
          className="field__input"
          type="search"
          placeholder="搜尋書刊"
          aria-label="搜尋書刊"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {showItems && (
          <div className="public-controls">
            {!searching && (
              <div className="public-section-heading">
                <button className="lit-back" aria-label="返回" onClick={() => setSection(null)}>
                  <Icon name="back" />
                </button>
                <h2>{PUBLIC_SECTIONS.find((entry) => entry.key === section)?.label}</h2>
              </div>
            )}
            <div className="lit-segment" aria-label="顯示方式">
              {[[ 'grid', '格狀' ], [ 'list', '條列' ]].map(([value, label]) => (
                <button key={value} aria-pressed={view === value} onClick={() => changeView(value)}>
                  <Icon name={value} /> {label}
                </button>
              ))}
            </div>
          </div>
        )}
        {!searching && section === 'magazines' && tabs.length > 0 && (
          <div className="lit-segment public-magazine-tabs" aria-label="雜誌類型">
            {tabs.map((tab) => (
              <button key={tab.key} aria-pressed={currentSub === tab.key} onClick={() => setSub(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {!showItems ? (
        <div className="public-section-grid public-section-enter">
          {sections.map((entry) => (
            <button key={entry.key} className="public-section-tile" onClick={() => {
              setSection(entry.key);
              setSub(null);
            }}>
              <Icon name={entry.icon} />
              <span><strong>{entry.label}</strong><small>{publications.filter((p) => p.section === entry.key).length} 項</small></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="public-section-enter" key={`${section}-${currentSub}-${view}-${searching}`}>
          <div className={`public-publications public-publications--${view}`}>
            {filtered.map((group) => {
              const total = group.variants.reduce(
                (sum, v) => sum + cart.filter((item) => item.publicationId === v.publication.id)
                  .reduce((n, item) => n + item.quantity, 0),
                0,
              );
              const badge = total > 0 && (
                <span className="public-publication__badge" aria-hidden="true">
                  <Icon name="check" />
                  ×{total}
                </span>
              );
              const primary = group.variants[0]?.publication || group;
              return (
                <div
                  className="public-publication"
                  key={`${group.code}|${group.format}`}
                  role="button"
                  tabIndex={0}
                  aria-label={total > 0 ? `${group.name}，已加入 ${total} 本` : group.name}
                  onClick={() => openItem(primary)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openItem(primary);
                    }
                  }}
                >
                  <span className="public-publication__cover">
                    <PubThumb publication={group.cover} size={view === 'grid' ? 'large' : 'mini'} fallback="title" />
                    {view === 'grid' && badge}
                  </span>
                  <span className="public-publication__text">
                    <strong>{group.name}</strong>
                    {view === 'list' && <small>{group.code}</small>}
                  </span>
                  {view === 'list' && badge}
                  {group.variants.length > 1 && (
                    <span
                      className="public-editions"
                      role="group"
                      aria-label="語言"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      {group.variants.map((v) => (
                        <button
                          key={v.language}
                          type="button"
                          aria-pressed={cart.some((item) => item.publicationId === v.publication.id)}
                          onClick={() => openItem(v.publication)}
                        >
                          {v.label}
                        </button>
                      ))}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          {!filtered.length && <p>找不到符合的書刊。</p>}
        </div>
      )}
    </>
  );
}

function ItemSheet({
  selected,
  person,
  cart,
  quantity,
  setQuantity,
  kind,
  setKind,
  subscription,
  coverRef,
  close,
  add,
}) {
  const existing = cart.some((item) => item.publicationId === selected.id && item.kind === kind);
  function changeKind(value) {
    setKind(value);
    setQuantity(cart.find((item) => item.publicationId === selected.id && item.kind === value)?.quantity || 1);
  }
  return (
    <Sheet title="加入申請單" close={close}>
      <div className="public-item">
        <div ref={coverRef} className="public-item-cover">
          <PubThumb publication={selected} size="large" />
        </div>
        <strong>{selected.name}</strong>
        <small>{selected.code}</small>
        <Stepper value={quantity} onChange={setQuantity} />
        {selected.standing && !person.guest && (
          <>
            <div className="lit-segment">
              <button aria-pressed={kind === 'once'} onClick={() => changeKind('once')}>
                單次
              </button>
              <button aria-pressed={kind === 'standing'} onClick={() => changeKind('standing')}>
                定期
              </button>
            </div>
            <small>定期：每期都幫你留</small>
            {subscription && <small>你目前定期 ×{subscription.quantity}</small>}
          </>
        )}
        <button className="btn btn--primary public-submit" onClick={add}>
          {existing ? '更新申請單' : '加入申請單'}
        </button>
      </div>
    </Sheet>
  );
}

function CartBar({ cart, publication, badgeRef, open }) {
  return (
    <div className="public-cart-bar">
      <div className="public-cart-summary" ref={badgeRef}>
        <span className="public-cart-covers" aria-hidden="true">
          {cart.slice(-3).reverse().map((item) => (
            <PubThumb key={`${item.publicationId}:${item.kind}`} publication={publication(item.publicationId)} size="mini" />
          ))}
        </span>
        <span>申請單 {cart.length} 項</span>
      </div>
      <button className="btn btn--primary" onClick={open}>
        查看並送出
      </button>
    </div>
  );
}

function CartSheet({ cart, setCart, publication, note, setNote, back, busy, error, submit }) {
  return (
    <div className="public-content">
      <button className="lit-back" onClick={back}>
        <Icon name="back" />
        繼續選書刊
      </button>
      <h1>申請單</h1>
      {cart.map((item) => {
        const p = publication(item.publicationId);
        return (
          p && (
            <div className="public-cart-row" key={`${item.publicationId}:${item.kind}`}>
              <PubThumb publication={p} />
              <span className="public-cart-name">
                <strong>{p.name}</strong>
                <small>{item.kind === 'standing' ? '定期' : '單次'}</small>
              </span>
              <Stepper
                value={item.quantity}
                onChange={(quantity) => setCart((current) => current.map((x) => (x === item ? { ...x, quantity } : x)))}
              />
              <button
                className="public-remove"
                aria-label={`移除${p.name}`}
                onClick={() => setCart((current) => current.filter((x) => x !== item))}
              >
                <Icon name="close" />
              </button>
            </div>
          )
        );
      })}
      <label className="field public-cart-note">
        <span className="field__label">備註（選填）</span>
        <textarea className="field__input" maxLength={300} rows={3}
          placeholder="例如：每年的天天查考聖經、要紙本…" value={note}
          onChange={(event) => setNote(event.target.value)} />
      </label>
      {error && (
        <p className="imp-error" role="alert">
          {error} 再試一次
        </p>
      )}
      <button className="btn btn--primary public-submit" disabled={busy || !cart.length} onClick={submit}>
        {busy ? (
          <>
            <span className="public-spinner" /> 送出中…
          </>
        ) : error ? (
          '再試一次'
        ) : (
          '送出申請'
        )}
      </button>
    </div>
  );
}

function DoneScreen({ done, publication, again }) {
  return (
    <div className="public-done">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <path d="M10 24l9 9 19-19" />
      </svg>
      <h1>已送出，謝謝！</h1>
      <ul>
        {done.map((item) => (
          <li key={`${item.publicationId}:${item.kind}`}>
            {publication(item.publicationId)?.name} · {item.kind === 'standing' ? '定期' : '單次'} ×{item.quantity}
          </li>
        ))}
      </ul>
      <button className="btn" onClick={again}>
        再申請其他書刊
      </button>
    </div>
  );
}

export default function PublicRequestForm({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [person, setPerson] = useState(null);
  const [cart, setCart] = useState([]);
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('grid');
  const [section, setSection] = useState(null);
  const [sub, setSub] = useState(null);
  const [note, setNote] = useState('');
  const [guest, setGuest] = useState(false);
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [kind, setKind] = useState('once');
  const [subs, setSubs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState([]);
  const [ready, setReady] = useState(false);
  const coverRef = useRef(null);
  const badgeRef = useRef(null);
  const base = `/api/public/literature/${encodeURIComponent(token)}`;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`litform:${token}`) || '{}');
      if (saved.person) {
        setPerson(saved.person);
        setStep(2);
      }
      if (Array.isArray(saved.cart)) setCart(saved.cart);
      if (typeof saved.note === 'string') setNote(saved.note);
      setView(localStorage.getItem('litform:view') === 'list' ? 'list' : 'grid');
    } catch {}
    setReady(true);
    fetch(base)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            response.status === 404 ? '這個連結已停用，請向書刊弟兄索取新連結。' : '載入失敗，請重新整理。',
          );
        }
        return response.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [base, token]);

  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(`litform:${token}`, JSON.stringify({ person, cart, note }));
      } catch {}
  }, [ready, token, person, cart, note]);

  useEffect(() => {
    if (person && !person.guest) {
      fetch(`${base}/person/${person.id}`)
        .then((response) => (response.ok ? response.json() : Promise.reject()))
        .then((result) => setSubs(result.subscriptions))
        .catch(() => setSubs([]));
    } else setSubs([]);
  }, [base, person]);

  function transition(fn) {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches && document.startViewTransition) {
      document.startViewTransition(() => flushSync(fn));
    } else fn();
  }
  function choose(p) {
    setGuest(false);
    setQuery('');
    if (p.guest) setCart((current) => current.filter((item) => item.kind !== 'standing'));
    transition(() => {
      setPerson(p);
      setStep(2);
    });
  }
  function openItem(p) {
    const queued = cart.find((item) => item.publicationId === p.id);
    setSelected(p);
    setKind(queued?.kind || defaultKind(p, Boolean(person?.guest)));
    setQuantity(queued?.quantity || 1);
  }
  function add() {
    const rect = coverRef.current?.getBoundingClientRect();
    const clone = coverRef.current?.cloneNode(true);
    flushSync(() =>
      setCart((current) => [
        ...current.filter((item) => !(item.publicationId === selected.id && item.kind === kind)),
        { publicationId: selected.id, kind, quantity },
      ]),
    );
    setSelected(null);
    if (!rect || !clone || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    requestAnimationFrame(() => {
      const end = badgeRef.current?.getBoundingClientRect();
      if (!end) return;
      Object.assign(clone.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
        zIndex: 999,
        pointerEvents: 'none',
      });
      document.body.appendChild(clone);
      const dx = end.left + end.width / 2 - rect.left - rect.width / 2;
      const dy = end.top + end.height / 2 - rect.top - rect.height / 2;
      const anim = clone.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx / 2}px,${dy / 2 - 40}px) scale(.6)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${dx}px,${dy}px) scale(.2)`, opacity: 0 },
        ],
        { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' },
      );
      anim.onfinish = () => {
        clone.remove();
        badgeRef.current?.animate(
          [{ transform: 'scale(1)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }],
          { duration: 150 },
        );
      };
    });
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${base}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(person.guest ? { guest: { name: person.name, note: person.note } } : { personId: person.id }),
          items: cart,
          note,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setDone(cart);
      setCart([]);
      setNote('');
      transition(() => setStep(4));
    } catch (e) {
      setError(e.message || '送出失敗，請再試一次。');
    } finally {
      setBusy(false);
    }
  }

  const publications = withCoverFallback((data?.publications || []).map((p) => ({ ...p, active: true })));
  const publication = (id) => publications.find((p) => String(p.id) === String(id));
  const subscription = selected && subs.find((s) => s.series === selected.series && s.language === selected.language);
  if (!data) return <main className="public-message">{error || '正在載入…'}</main>;

  return (
    <main className="lit-page public-form">
      <header className="public-header">
        <strong>{data.congregation.name}</strong>
        {step > 1 && step < 4 && (
          <button
            className="public-person-chip"
            style={{ viewTransitionName: 'chosen-person' }}
            onClick={() =>
              transition(() => {
                setQuery('');
                setStep(1);
              })
            }
          >
            {person?.name} · 換人
          </button>
        )}
      </header>
      {step === 1 && (
        <NameStep
          groups={data.groups}
          person={person}
          query={query}
          setQuery={setQuery}
          choose={choose}
          openGuest={() => setGuest(true)}
        />
      )}
      {step === 2 && (
        <CatalogStep
          publications={publications}
          cart={cart}
          query={query}
          setQuery={setQuery}
          view={view}
          setView={setView}
          section={section}
          setSection={setSection}
          sub={sub}
          setSub={setSub}
          openItem={openItem}
        />
      )}
      {step === 3 && (
        <CartSheet
          cart={cart}
          setCart={setCart}
          publication={publication}
          note={note}
          setNote={setNote}
          busy={busy}
          error={error}
          submit={submit}
          back={() => transition(() => setStep(2))}
        />
      )}
      {step === 4 && (
        <DoneScreen
          done={done}
          publication={publication}
          again={() => {
            setDone([]);
            setQuery('');
            transition(() => setStep(2));
          }}
        />
      )}
      {step === 2 && cart.length > 0 && (
        <CartBar cart={cart} publication={publication} badgeRef={badgeRef} open={() => transition(() => setStep(3))} />
      )}
      {guest && <GuestSheet close={() => setGuest(false)} choose={choose} />}
      {selected && (
        <ItemSheet
          selected={selected}
          person={person}
          cart={cart}
          quantity={quantity}
          setQuantity={setQuantity}
          kind={kind}
          setKind={setKind}
          subscription={subscription}
          coverRef={coverRef}
          close={() => setSelected(null)}
          add={add}
        />
      )}
    </main>
  );
}
