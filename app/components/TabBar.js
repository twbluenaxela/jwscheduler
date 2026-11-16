'use client';

import { useEffect, useRef, useState } from 'react';

export default function TabBar({ page, setPage, role, onAdmin, canLiterature }) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!moreOpen) return;
    closeButtonRef.current?.focus();
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen]);

  const canEdit = role === 'ADMIN' || role === 'SYSADMIN';
  const isSysadmin = role === 'SYSADMIN';
  const items = [
    {
      id: 'meetings', label: '本週',
      icon: <svg viewBox="0 0 24 24" className="navicon"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9h17M8 3.5v3M16 3.5v3"/></svg>,
    },
    {
      id: 'overview', label: '總覽',
      icon: <svg viewBox="0 0 24 24" className="navicon"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/></svg>,
    },
    {
      id: 'people', label: '人員',
      icon: <svg viewBox="0 0 24 24" className="navicon"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 6.5a2.7 2.7 0 0 1 0 5.2M17.5 19c0-2.2-1-3.8-2.5-4.6"/></svg>,
    },
    {
      id: 'services', label: '服務',
      icon: <svg viewBox="0 0 24 24" className="navicon"><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4.5h6M9 10h6M9 14h6M9 18h4" /></svg>,
    },
    {
      id: 'literature', label: '書刊',
      icon: <svg viewBox="0 0 24 24" className="navicon"><path d="M4 5.5C7 4 10 4.5 12 6v14c-2-1.5-5-2-8-.5zM20 5.5C17 4 14 4.5 12 6v14c2-1.5 5-2 8-.5z" /></svg>,
    },
    {
      id: 'import', label: '匯入',
      icon: <svg viewBox="0 0 24 24" className="navicon"><path d="M12 3.5v10m0 0 3.5-3.5M12 13.5 8.5 10"/><path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/></svg>,
    },
    {
      id: 'settings', label: '設定',
      icon: <svg viewBox="0 0 24 24" className="navicon"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    },
  ];

  const visible = items.filter((i) => (i.id !== 'literature' || canLiterature) && (canEdit || (i.id !== 'import' && i.id !== 'people')));
  if (isSysadmin && onAdmin) {
    visible.push({
      id: 'admin', label: '管理', isAdmin: true,
      icon: <svg viewBox="0 0 24 24" className="navicon"><path d="M12 3l7 3v6c0 4-3 6.5-7 9-4-2.5-7-5-7-9V6z"/></svg>,
    });
  }

  const priority = ['meetings', 'overview', 'services', 'literature', 'people', 'import', 'settings', 'admin'];
  visible.sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id));
  const hasOverflow = visible.length > 5;
  const primary = hasOverflow ? visible.slice(0, 4) : visible;
  const overflow = hasOverflow ? visible.slice(4) : [];
  const currentOverflow = overflow.find((item) => item.id === page);
  const descriptions = {
    people: '名單、資格與小組',
    import: 'EPUB 匯入與匯出',
    settings: '帳號與會眾設定',
    admin: '系統管理',
  };

  function navigate(item) {
    setMoreOpen(false);
    if (item.isAdmin) onAdmin();
    else setPage(item.id);
  }

  function closeMore() {
    setMoreOpen(false);
    moreButtonRef.current?.focus();
  }

  return (
    <>
      <nav className="tabbar" aria-label="主要導覽" style={{ gridTemplateColumns: `repeat(${primary.length + (hasOverflow ? 1 : 0)}, minmax(64px, 1fr))` }}>
        {primary.map((item) => (
          <button
            key={item.id}
            className="tabbar__item"
            aria-current={page === item.id ? 'page' : undefined}
            onClick={() => navigate(item)}
          >
            <span className="tabbar__icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        {hasOverflow && (
          <button
            ref={moreButtonRef}
            className="tabbar__item"
            aria-current={currentOverflow ? 'page' : undefined}
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
          >
            <span className="tabbar__icon">
              {currentOverflow ? currentOverflow.icon : (
                <svg viewBox="0 0 24 24" className="navicon" aria-hidden="true">
                  <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
                </svg>
              )}
            </span>
            <span>{currentOverflow?.label ?? '更多'}</span>
          </button>
        )}
      </nav>
      {moreOpen && (
        <div className="sheet-backdrop open" onClick={(event) => { if (event.target === event.currentTarget) closeMore(); }}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="tabbar-more-title">
            <div className="sheet__grab" />
            <header className="sheet__head">
              <div className="sheet__heads"><div className="sheet__role" id="tabbar-more-title">更多</div></div>
              <button ref={closeButtonRef} className="sheet__close" aria-label="關閉" onClick={closeMore}>✕</button>
            </header>
            <div className="tabbar-more__list">
              {overflow.map((item) => (
                <button key={item.id} className="tabbar-more__row" aria-current={page === item.id ? 'page' : undefined} onClick={() => navigate(item)}>
                  {item.icon}
                  <span className="tabbar-more__text"><span>{item.label}</span><small>{descriptions[item.id]}</small></span>
                  {page === item.id && <svg viewBox="0 0 24 24" className="navicon" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
