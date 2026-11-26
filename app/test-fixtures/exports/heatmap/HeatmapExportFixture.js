'use client';

import { useEffect, useState } from 'react';

import AssignmentHeatmap from '../../../components/AssignmentHeatmap';
import { FIXTURE_WEEKS, fixtureGetAssign } from '../../midweek-pdf/fixtureWeeks.mjs';
import { weekendFixtureRows } from '../../weekend-pdf/fixtureRows.mjs';

// LOCAL TEST ONLY. Renders the real 指派分布 (grid + 個人檢視) against synthetic
// weeks/rows so tests/e2e/exports.e2e.mjs can press every item of its 匯出 menu.
//
// The people are exactly the names the two fixtures assign, so both views have
// real events for every row (an empty person would make the exported text a
// degenerate "0 份" that passes no matter what).
//
// PUBLIC REPO: fake names only.
const NAMES = [
  ['王小明', 'M'], ['陳大文', 'M'], ['林小華', 'M'], ['何美玲', 'F'],
  ['張志明', 'M'], ['李淑芬', 'F'], ['黃俊傑', 'M'], ['吳天恩', 'M'],
  ['周美惠', 'F'], ['鄭建國', 'M'], ['許雅婷', 'F'], ['曾信德', 'M'],
];

export const FIXTURE_PEOPLE = NAMES.map(([name, g], index) => ({
  id: 9000 + index,
  name,
  g,
  appt: g === 'M' ? '長老' : '—',
  quals: [],
  status: 'active',
  assignmentNote: '',
  assignmentIntervalMonths: 0,
}));

export default function HeatmapExportFixture() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(timer);
  }, []);

  return (
    <main>
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <AssignmentHeatmap
        people={FIXTURE_PEOPLE}
        midweekWeeks={FIXTURE_WEEKS}
        weekendRows={weekendFixtureRows()}
        getAssign={fixtureGetAssign}
      />
    </main>
  );
}
