'use client';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { CATEGORY_LABELS, matchPublications, withCoverFallback } from '../../lib/literature.mjs';
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

function CatalogStep({ publications, query, setQuery, view, setView, category, setCategory, openItem }) {
  const filtered = matchPublications(
    query,
    publications.filter((p) => category === 'all' || p.category === category),
    { limit: publications.length },
  );
  function changeView(value) {
    setView(value);
    try {
      localStorage.setItem('litform:view', value);
    } catch {}
  }
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
        <div className="public-controls">
          <div className="lit-segment" aria-label="顯示方式">
            {[
              ['grid', '格狀'],
              ['list', '條列'],
            ].map(([value, label]) => (
              <button key={value} aria-pressed={view === value} onClick={() => changeView(value)}>
                <Icon name={value} /> {label}
              </button>
            ))}
          </div>
          <div className="chips lit-chips">
            {['all', ...new Set(publications.map((p) => p.category))].map((value) => (
              <button className="chip" key={value} aria-pressed={category === value} onClick={() => setCategory(value)}>
                {value === 'all' ? '全部' : CATEGORY_LABELS[value] || value}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={`public-publications public-publications--${view}`} key={view}>
        {filtered.map((p) => (
          <button className="public-publication" key={p.id} onClick={() => openItem(p)}>
            <PubThumb publication={p} size={view === 'grid' ? 'large' : 'mini'} />
            <span>
              <strong>{p.name}</strong>
              {view === 'list' && <small>{p.code}</small>}
            </span>
          </button>
        ))}
      </div>
      {!filtered.length && <p>找不到符合的書刊。</p>}
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

function CartBar({ cart, badgeRef, open }) {
  return (
    <div className="public-cart-bar">
      <span ref={badgeRef}>申請單 {cart.length} 項</span>
      <button className="btn btn--primary" onClick={open}>
        查看並送出
      </button>
    </div>
  );
}

function CartSheet({ cart, setCart, publication, back, busy, error, submit }) {
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
  const [category, setCategory] = useState('all');
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
        localStorage.setItem(`litform:${token}`, JSON.stringify({ person, cart }));
      } catch {}
  }, [ready, token, person, cart]);

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
    setSelected(p);
    setKind('once');
    setQuantity(cart.find((item) => item.publicationId === p.id && item.kind === 'once')?.quantity || 1);
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
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setDone(cart);
      setCart([]);
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
          query={query}
          setQuery={setQuery}
          view={view}
          setView={setView}
          category={category}
          setCategory={setCategory}
          openItem={openItem}
        />
      )}
      {step === 3 && (
        <CartSheet
          cart={cart}
          setCart={setCart}
          publication={publication}
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
        <CartBar cart={cart} badgeRef={badgeRef} open={() => transition(() => setStep(3))} />
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
