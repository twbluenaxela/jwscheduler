'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Zoom-to-fit for the 週中 card on iPad widths only. The card itself keeps the
// exact desktop markup and CSS; this wrapper only changes its *layout width*
// and zooms the whole box uniformly, like scaling a printed sheet. Phones
// (≤699px) and desktop (≥1367px) render a fragment — nothing is wrapped, nothing
// is zoomed. Print-stage / PDF capture cards are never passed through here.

const MIN_WIDTH = 700;
const MAX_WIDTH = 1366;
const MIN_SCALE = 0.6;
const MAX_SCALE = 1.6;
// Headless Chromium reports visualViewport === innerHeight even though a real
// iPad Safari has ~80px of toolbars. The e2e suite models that same allowance.
const TOOLBAR_ALLOWANCE = 80;

const isTablet = () => window.innerWidth >= MIN_WIDTH && window.innerWidth <= MAX_WIDTH;
const clamp = (n) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));

export default function FitToScreen({ children }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const lastRef = useRef(null);
  const frameRef = useRef(0);
  const [active, setActive] = useState(false);

  // Measure the card's *unscaled* size (offset/rect ÷ current zoom), never its
  // zoomed bounding box, so a resize can't feed back into the next measurement.
  const measure = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    if (!isTablet()) {
      outer.style.zoom = '';
      outer.style.width = '';
      delete outer.dataset.fitScale;
      lastRef.current = null;
      return;
    }

    const parent = outer.parentElement;
    if (!parent) return;
    const parentStyle = getComputedStyle(parent);
    const padX = (parseFloat(parentStyle.paddingLeft) || 0) + (parseFloat(parentStyle.paddingRight) || 0);
    const availableWidth = parent.clientWidth - padX;
    if (availableWidth <= 0) return;

    // The visible bottom = visual viewport (which already excludes Safari's
    // toolbars on a real iPad) + its scroll offset. In a browser that reports
    // no chrome at all, subtract the toolbar allowance explicitly.
    const vv = window.visualViewport;
    const vvHeight = vv?.height || window.innerHeight;
    const reportedChrome = window.innerHeight - vvHeight;
    const visibleBottom = reportedChrome > 10
      ? (vv?.offsetTop || 0) + vvHeight
      : (vv?.offsetTop || 0) + window.innerHeight - TOOLBAR_ALLOWANCE;
    // Card top is in viewport coordinates and is unaffected by the wrapper's
    // own zoom, so every real element above the card is subtracted for free.
    const availableHeight = visibleBottom - outer.getBoundingClientRect().top;
    if (availableHeight <= 0) return;

    const zoomNow = parseFloat(getComputedStyle(outer).zoom) || 1;
    const naturalNow = inner.getBoundingClientRect().height / zoomNow;
    const layoutWidthNow = inner.offsetWidth;
    const last = lastRef.current;
    if (last && Math.abs(layoutWidthNow - last.width) < 0.5
      && Math.abs(naturalNow - last.natural) < 0.5
      && Math.abs(availableWidth - last.availableWidth) < 0.5
      && Math.abs(availableHeight - last.availableHeight) < 0.5) return;

    // Find the scale whose zoomed card height equals the available height.
    // Browsers round CSS lengths *inside* a zoom, so the card's natural height
    // changes by a few pixels as zoom changes; a plain scale = available /
    // natural can therefore oscillate around a rounding step. A bounded binary
    // search over scale, keeping the best candidate that does not overshoot,
    // settles in a few frames and never feeds a zoomed box back as a natural
    // measurement. Each candidate is derived from scale = available / natural.
    let lo = MIN_SCALE;
    let hi = MAX_SCALE;
    let best = null;
    for (let i = 0; i < 16; i += 1) {
      const candidate = (lo + hi) / 2;
      outer.style.width = `${availableWidth / candidate}px`;
      outer.style.zoom = String(candidate);
      const natural = inner.getBoundingClientRect().height / candidate;
      const visual = natural * candidate;
      if (!visual) break;
      const remaining = availableHeight - visual;
      // A sub-pixel overshoot is fine (the card must not go more than ~1px past
      // the usable bottom); a real overshoot is not.
      const score = Math.abs(remaining) + (remaining < -1 ? 100 : 0);
      if (!best || score < best.score) best = { scale: candidate, score };
      if (Math.abs(remaining) <= 0.5) break;
      if (remaining > 0) lo = candidate;
      else hi = candidate;
    }

    const scale = clamp(best?.scale ?? clamp(availableHeight / naturalNow));
    // Widening when zoomed down (and narrowing when zoomed up) makes the
    // zoomed card span the content area exactly, at every viewport.
    const finalWidth = availableWidth / scale;
    outer.style.width = `${finalWidth}px`;
    outer.style.zoom = String(scale);
    outer.dataset.fitScale = String(scale);
    outer.dataset.fitAvailable = String(availableHeight);
    lastRef.current = {
      width: finalWidth,
      natural: inner.getBoundingClientRect().height / scale,
      availableWidth,
      availableHeight,
    };
  }, []);

  const schedule = useCallback(() => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    const sync = () => {
      setActive(isTablet());
      schedule();
    };
    sync();
    // Font metrics settle after hydration and can change both the chrome above
    // the card and the card's natural height; discard the cached fit and redo
    // it once they are ready.
    const resync = () => { lastRef.current = null; schedule(); };
    document.fonts?.ready.then(resync);
    window.addEventListener('load', resync);
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('load', schedule);
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', schedule);
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [schedule]);

  useEffect(() => {
    if (!active || !innerRef.current) return undefined;
    // Catches edit-mode toggles, inline editors opening/closing and data
    // changes — any of which alter the card's natural height.
    const observer = new ResizeObserver(schedule);
    observer.observe(innerRef.current);
    // The parent's fixture/status text and web fonts can settle just after
    // mount; redo the fit once the first paint has finished.
    const settle = setTimeout(() => { lastRef.current = null; schedule(); }, 300);
    schedule();
    return () => { clearTimeout(settle); observer.disconnect(); };
  }, [active, schedule]);

  // Every parent render (week change, edit toggle, ...) re-checks the fit; the
  // measurement guard above makes a no-op cheap.
  useEffect(() => { schedule(); });

  if (!active) return children;

  return (
    <div ref={outerRef} className="fit-to-screen">
      <div ref={innerRef} className="fit-to-screen__inner">{children}</div>
    </div>
  );
}
