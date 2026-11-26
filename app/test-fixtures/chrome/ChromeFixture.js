'use client';

import { useState } from 'react';

import FixtureChrome from '../FixtureChrome';
import OverviewExportFixture from '../exports/overview/OverviewExportFixture';
import WeekendExportFixture from '../exports/weekend/WeekendExportFixture';
import ServicesExportFixture from '../exports/services/ServicesExportFixture';
import PeopleExportFixture from '../exports/people/PeopleExportFixture';
import CountSheetExportFixture from '../exports/countsheet/CountSheetExportFixture';
import ImportExportFixture from '../exports/import/ImportExportFixture';
import SettingsPage from '../../components/SettingsPage';

// LOCAL TEST ONLY. Mounts each real page fixture inside the app chrome so the
// e2e can check that the 68px rail does not break any page at 1081–1366px.
const PAGES = {
  overview: ['overview', OverviewExportFixture],
  weekend: ['meetings', WeekendExportFixture],
  services: ['services', ServicesExportFixture],
  people: ['people', PeopleExportFixture],
  countSheet: ['literature', CountSheetExportFixture],
  import: ['import', ImportExportFixture],
  settings: ['settings', null],
};

export default function ChromeFixture({ name = 'overview' }) {
  const [congSettings, setCongSettings] = useState({});
  const [page, Active] = PAGES[name] ?? PAGES.overview;
  return (
    <FixtureChrome page={page}>
      {Active ? <Active /> : (
        <SettingsPage
          congSettings={congSettings}
          setCongSettings={setCongSettings}
          existingWeeks={[]}
          getAssign={() => ''}
          onReapplySchedule={() => {}}
        />
      )}
    </FixtureChrome>
  );
}
