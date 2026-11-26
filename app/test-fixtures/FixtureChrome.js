'use client';

import { useEffect } from 'react';

import Sidebar from '../components/Sidebar';
import TopBar from '../components/TopBar';
import TabBar from '../components/TabBar';
import { installFixtureUser } from './fixtureAuth';

// LOCAL TEST ONLY. Wraps a fixture in the REAL app shell (sidebar, topbar,
// tabbar) so layout audits measure the same chrome the 聚會 page has. The
// sidebar rail is CSS-driven, so the same mount covers phone, iPad and desktop.
export default function FixtureChrome({ page = 'meetings', children }) {
  useEffect(() => { installFixtureUser(); }, []);

  return (
    <>
      <div className="shell">
        <Sidebar
          page={page}
          setPage={() => {}}
          congName="測試會所"
          role="ADMIN"
          canLiterature
          newFormCount={0}
          scheduleStats={undefined}
          onAdmin={() => {}}
        />
        <TopBar page={page} />
        <div className="content">{children}</div>
      </div>
      <TabBar
        page={page}
        setPage={() => {}}
        role="ADMIN"
        canLiterature
        newFormCount={0}
        onAdmin={() => {}}
      />
    </>
  );
}
