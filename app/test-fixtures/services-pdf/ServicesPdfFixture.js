'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import ServicesPage from '../../components/ServicesPage';
import PrintStage from '../../components/PrintStage';
import ServicesPrintSheet from '../../components/ServicesPrint';
import { FIXTURE_CATEGORIES, FIXTURE_MONTH, fixtureMonthData } from './fixtureMonth.mjs';

// LOCAL TEST ONLY. Renders the real 服務 page against a mocked API (no login, no
// database) so the e2e test can press 匯出 ▸ 下載 PDF / 匯出 JPG exactly as a
// person would, and also keeps one static PrintStage on the page so the print
// CSS can be measured at 390×844 before any capture happens.
export default function ServicesPdfFixture() {
  const [ready, setReady] = useState(false);
  const staticNodesRef = useRef([]);
  const monthData = fixtureMonthData(FIXTURE_MONTH);

  // The page's data calls are all in useEffect, which runs after this layout
  // effect, so patching window.fetch here intercepts every one of them.
  useLayoutEffect(() => {
    const real = window.fetch.bind(window);
    const json = (body) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const patched = async (input, init = {}) => {
      const raw = typeof input === 'string' ? input : input.url;
      const url = new URL(raw, window.location.origin);
      if (!url.pathname.startsWith('/api/')) return real(input, init);
      if (url.pathname === '/api/services') return json({ categories: FIXTURE_CATEGORIES });
      if (url.pathname === '/api/services/month') {
        return json(fixtureMonthData(url.searchParams.get('month') || FIXTURE_MONTH));
      }
      if (url.pathname === '/api/services/cleaning') {
        const year = url.searchParams.get('year');
        return json({
          year,
          months: Array.from({ length: 12 }, (_, index) => ({
            month: `${year}-${String(index + 1).padStart(2, '0')}`,
            assignments: index === 3
              ? [{
                id: 900,
                categoryId: 2,
                date: `${year}-04-01`,
                position: '小組',
                personId: null,
                personName: null,
                text: 'A,D',
                kind: 'groups',
              }]
              : [],
          })),
        });
      }
      return json({ ok: true });
    };
    window.fetch = patched;
    return () => {
      window.fetch = real;
    };
  }, []);

  useEffect(() => {
    setReady(true);
  }, []);

  const user = {
    displayName: '王小明',
    getIdToken: async () => 'fixture-token',
  };

  return (
    <main>
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <div className="content" style={{ padding: 16 }}>
        <ServicesPage firebaseUser={user} canEdit people={[]} />
      </div>

      {/* A permanent copy of what 匯出 captures, for geometry assertions. */}
      <PrintStage nodesRef={staticNodesRef} className="print-stage--services">
        <ServicesPrintSheet
          month={FIXTURE_MONTH}
          categories={FIXTURE_CATEGORIES}
          monthData={monthData}
        />
      </PrintStage>
    </main>
  );
}
