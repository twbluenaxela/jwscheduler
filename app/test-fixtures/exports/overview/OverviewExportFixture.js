'use client';

import { useEffect, useState } from 'react';

import OverviewPage from '../../../components/OverviewPage';
import MountOnly from '../../MountOnly';
import { installFixtureUser } from '../../fixtureAuth';
import { FIXTURE_WEEKS, fixtureGetAssign } from '../../midweek-pdf/fixtureWeeks.mjs';
import { weekendFixtureRows } from '../../weekend-pdf/fixtureRows.mjs';

// LOCAL TEST ONLY. Mounts the real 總覽 page (安排 / 最近變更 / 指派分布 tabs) with
// synthetic data and a canned /api/changelog response, so
// tests/e2e/exports.e2e.mjs can press 最近變更 ▸ 複製文字.
//
// PUBLIC REPO: fake names only.
export const FIXTURE_CHANGES = [
  {
    id: 1,
    action: 'reassign',
    name: '王小明',
    date: '9月 9日',
    label: '主席',
    prevName: '陳大文',
    createdAt: '2026-09-02T00:05:00.000Z',
    actorName: '管理員',
  },
  {
    id: 2,
    action: 'clear',
    name: '',
    date: '9月 16日',
    label: '開始禱告',
    prevName: '林小華',
    createdAt: '2026-09-01T23:40:00.000Z',
    actorName: '管理員',
  },
];

// MountOnly: the e2e freezes the clock, and the page derives its month window
// from today — server and client must not disagree about the year.
export default function OverviewExportFixture() {
  return (
    <MountOnly>
      <Body />
    </MountOnly>
  );
}

function Body() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const real = window.fetch.bind(window);
    const json = (body) => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    window.fetch = async (input, init = {}) => {
      const raw = typeof input === 'string' ? input : input.url;
      const url = new URL(raw, window.location.origin);
      if (!url.pathname.startsWith('/api/')) return real(input, init);
      if (url.pathname === '/api/changelog') return json({ entries: FIXTURE_CHANGES });
      return json({ ok: true });
    };
    installFixtureUser().catch(() => {}).finally(() => setReady(true));
    return () => { window.fetch = real; };
  }, []);

  return (
    <main>
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <div className="content" style={{ padding: 16 }}>
        <OverviewPage
          midweekWeeks={FIXTURE_WEEKS}
          weekendRows={weekendFixtureRows()}
          people={[]}
          getAssign={fixtureGetAssign}
          canEdit
        />
      </div>
    </main>
  );
}
