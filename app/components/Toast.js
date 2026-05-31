'use client';
import { useEffect, useRef } from 'react';

export default function Toast({ toast, onHide }) {
  const timerRef = useRef(null);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(onHide, 4200);
    return () => clearTimeout(timerRef.current);
  }, [toast, onHide]);

  if (!toast) return null;

  const parts = toast.msg.split(/(\S+)$/);
  return (
    <div className="toast show">
      <span>
        {parts.length === 3 ? (
          <>{parts[0]}<b>{parts[1]}</b>{parts[2]}</>
        ) : toast.msg}
      </span>
      {toast.undo && (
        <button
          className="toast__undo"
          onClick={() => { toast.undo(); onHide(); }}
        >
          復原
        </button>
      )}
    </div>
  );
}
