'use client';

import { useEffect, useState } from 'react';

// LOCAL TEST ONLY. Renders its children after the first client mount, i.e. never
// during SSR.
//
// A fixture that freezes the clock (the e2e does it with an init script) renders
// one year on the server and another on the client — 週末 resolves year-less
// "M/D" dates against today, so a frozen January page disagrees with a November
// server and React throws a hydration error that has nothing to do with the
// export being tested. The real pages are client-only anyway (the app gates them
// behind auth), so a fixture that skips SSR is also the more faithful mount.
export default function MountOnly({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? children : null;
}
