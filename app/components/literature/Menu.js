'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Icon from './Icon';

export default function Menu({ items, label = '更多選項' }) {
  const [open, setOpen] = useState(false);
  const [alignLeft, setAlignLeft] = useState(false);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!open) return;
    setAlignLeft(panelRef.current.getBoundingClientRect().left < 8);
    panelRef.current.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event) {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function selectItem(onSelect) {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
    onSelect();
  }

  return (
    <span className="lit-popmenu-wrap" ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className="lit-popmenu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setAlignLeft(false);
          setOpen((previous) => !previous);
        }}
      >
        <Icon name="more" />
      </button>
      {open && (
        <div
          ref={panelRef}
          role="menu"
          className="lit-popmenu"
          style={alignLeft ? { left: 0, right: 'auto' } : undefined}
        >
          {items.map((item, index) => (
            <button
              key={index}
              type="button"
              role="menuitem"
              className={item.danger ? 'lit-popmenu__item--danger lit-popmenu-danger' : undefined}
              onClick={() => selectItem(item.onSelect)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
