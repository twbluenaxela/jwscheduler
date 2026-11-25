'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// A small dropdown for the 服務 page header: an anchored trigger and a panel
// that opens rightwards, clamped to the viewport. Same visual language as the
// meetings page's `.menu`, but with the measured `position: fixed` placement the
// heatmap's export menu needed — an absolutely-positioned panel is clipped by
// the sticky header it lives in.
export default function HeaderMenu({ label = '匯出', disabled = false, children }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const anchor = btnRef.current;
    if (!panel || !anchor) return;
    panel.style.top = '0px';
    panel.style.left = '0px';
    const box = panel.getBoundingClientRect();
    const a = anchor.getBoundingClientRect();
    const M = 8;
    let top = a.bottom + M;
    if (top + box.height > window.innerHeight - M) {
      const above = a.top - box.height - M;
      top = above >= M ? above : Math.max(M, window.innerHeight - M - box.height);
    }
    const left = Math.max(M, Math.min(a.left, window.innerWidth - box.width - M));
    panel.style.top = `${top}px`;
    panel.style.left = `${left}px`;
    panel.style.visibility = 'visible';
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    const esc = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        btnRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="menuwrap" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="btn"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((previous) => !previous);
        }}
      >
        {label} <span className="caret">▾</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          className="menu menu--anchored"
          style={{ visibility: 'hidden' }}
          onClick={(event) => {
            event.stopPropagation();
            // Picking an item runs its action and closes the menu; clicking
            // the padding does neither.
            if (event.target.closest('button')) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
