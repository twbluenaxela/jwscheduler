'use client';

import { useEffect, useRef, useState } from 'react';

export default function CopyCalendarLink({ url }) {
  const [label, setLabel] = useState('複製訂閱網址');
  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setLabel('已複製');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setLabel('複製訂閱網址'), 1500);
    } catch {
      setLabel('複製失敗，請再試一次');
    }
  }

  return <button className="calendar-page__button calendar-page__button--quiet" type="button" onClick={copy}>{label}</button>;
}
