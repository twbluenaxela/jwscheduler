'use client';

import { useEffect, useState } from 'react';

import PeoplePage from '../../../components/PeoplePage';
import MountOnly from '../../MountOnly';
import { FIXTURE_WEEKS, fixtureGetAssign } from '../../midweek-pdf/fixtureWeeks.mjs';
import { weekendFixtureRows } from '../../weekend-pdf/fixtureRows.mjs';
import { installFixtureUser } from '../../fixtureAuth';

// LOCAL TEST ONLY. Mounts the real 人員 page with synthetic weeks/rows so
// tests/e2e/exports.e2e.mjs can press ↓ iCal and 複製行事曆連結.
//
// PeoplePage signs its API calls with `getToken()` from auth-context, which reads
// Firebase's currentUser. A fixture has no login, so `installFixtureUser` puts a
// user-shaped object there and `patchFetch` answers the two endpoints the page
// touches. Nothing leaves the browser.
//
// PUBLIC REPO: fake names only.
export const FIXTURE_PEOPLE = [
  {
    id: 7001,
    name: '王小明',
    g: 'M',
    appt: '長老',
    quals: ['傳道與生活主席', '禱告'],
    serviceGroup: 'A',
    status: 'active',
    assignmentNote: '',
    assignmentIntervalMonths: 0,
  },
  {
    id: 7002,
    name: '何美玲',
    g: 'F',
    appt: '—',
    quals: ['聖經朗讀'],
    serviceGroup: 'B',
    status: 'active',
    assignmentNote: '',
    assignmentIntervalMonths: 0,
  },
];

// MountOnly: the e2e freezes the clock (so the 9月 weeks count as 未來安排), and
// server/client disagreeing on "today" would be a hydration error, not a bug in
// the export being tested.
export default function PeopleExportFixture() {
  return (
    <MountOnly>
      <Body />
    </MountOnly>
  );
}

function Body() {
  const [people, setPeople] = useState(FIXTURE_PEOPLE);
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
      if (/^\/api\/people\/\d+\/calendar-feed$/.test(url.pathname) && (init.method ?? 'POST') === 'POST') {
        return json({ url: 'https://example.test/cal/tok.ics', page: 'https://example.test/cal/fixture-token' });
      }
      if (/^\/api\/services\/person\//.test(url.pathname)) return json({ items: [] });
      if (url.pathname === '/api/people') return json({ people: FIXTURE_PEOPLE });
      return json({ ok: true });
    };
    // The page's fetches all run in effects (or on click), so installing the
    // user here is early enough for every getToken() call.
    installFixtureUser().catch(() => {}).finally(() => setReady(true));
    return () => { window.fetch = real; };
  }, []);

  return (
    <main>
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <div className="content" style={{ padding: 16 }}>
        <PeoplePage
          people={people}
          setPeople={setPeople}
          midweekWeeks={FIXTURE_WEEKS}
          weekendRows={weekendFixtureRows()}
          congCode="fixture"
          canEdit
        />
      </div>
    </main>
  );
}

export { fixtureGetAssign };
