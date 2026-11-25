'use client';

import { useEffect, useRef, useState } from 'react';

import MidweekWeek from '../../components/MidweekWeek';
import { exportNodesPdf, exportNodesPdfGrid } from '../../lib/midweekExport';
import { DEFAULT_LAYOUT, normalizeLayout } from '../../lib/pdfLayout.mjs';
import { FIXTURE_WEEKS, fixtureGetAssign } from './fixtureWeeks.mjs';

// LOCAL TEST ONLY. Renders the same off-screen capture block the 匯出 page uses
// (ImportPage), with synthetic weeks, and exposes the two PDF exports on
// `window` so tests/e2e/midweek-pdf.e2e.mjs can download them the way a person
// would and inspect the bytes. The `editing` prop mirrors body.editing so the
// test can prove edit-mode CSS never reaches a capture.
export default function PdfFixture({ editing = false }) {
  const weeks = FIXTURE_WEEKS;
  const captureRefs = useRef([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('editing', Boolean(editing));
    return () => document.body.classList.remove('editing');
  }, [editing]);

  useEffect(() => {
    const nodes = () => weeks.map((_, i) => captureRefs.current[i] ?? null);

    // Called from the page context by the Playwright test.
    window.__exportPdf = () => exportNodesPdf(nodes(), weeks);
    window.__exportGrid = (perPage = 2) => {
      const layout = normalizeLayout({ ...DEFAULT_LAYOUT, count: perPage });
      return exportNodesPdfGrid(nodes(), weeks, layout);
    };
    setReady(true);
    return () => {
      delete window.__exportPdf;
      delete window.__exportGrid;
    };
  }, [weeks]);

  return (
    <main>
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <div className="mw-pdf-captures" aria-hidden="true">
        {weeks.map((week, i) => (
          <MidweekWeek
            key={week.id ?? i}
            week={week}
            editMode={false}
            getAssign={fixtureGetAssign}
            openSheet={() => {}}
            updateMidweekWeek={() => {}}
            cardRef={(el) => { captureRefs.current[i] = el; }}
          />
        ))}
      </div>
    </main>
  );
}
