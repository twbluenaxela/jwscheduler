'use client';

import { useEffect, useRef, useState } from 'react';

import WeekendView from '../../components/WeekendView';
import { exportStagePdf } from '../../lib/printPdf';
import { getWeekendExportFilename } from '../../lib/weekendExport';
import { weekendPrintChunks } from '../../lib/weekendPrint.mjs';
import { fixtureWeekendGetAssign, weekendFixtureRows } from './fixtureRows.mjs';

// LOCAL TEST ONLY. Renders the real WeekendView (live table + mobile cards + the
// PrintStage PDF build) with synthetic rows and exposes the PDF export on
// `window` so tests/e2e/weekend-pdf.e2e.mjs can download it exactly the way the
// 匯出 menu does.
export default function WeekendPdfFixture() {
  // Built once: WeekendView re-filters on every render, so a fresh array per
  // render would also re-run the export-registration effect.
  const [rows] = useState(weekendFixtureRows);
  const printNodesRef = useRef([]);
  const visibleRowsRef = useRef([]);
  const captureRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    window.__exportPdf = () => exportStagePdf(printNodesRef.current, {
      filename: getWeekendExportFilename(visibleRowsRef.current, 'pdf', '週末聚會'),
    });
    window.__fixture = {
      rowCount: rows.length,
      // The chunks the stage renders, so the test can assert the page count
      // against the same function the export uses.
      chunks: weekendPrintChunks(rows).length,
      // What the year/filter gate actually kept — a fixture whose dates resolve
      // to another year would otherwise pass an empty-looking page-count test.
      visible: () => visibleRowsRef.current.length,
    };
    setReady(true);
    return () => {
      delete window.__exportPdf;
      delete window.__fixture;
    };
  }, [rows]);

  return (
    <main>
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <WeekendView
        filter="all"
        setFilter={() => {}}
        weekendRows={rows}
        getAssign={fixtureWeekendGetAssign}
        openSheet={() => {}}
        captureRef={captureRef}
        visibleRowsRef={visibleRowsRef}
        printNodesRef={printNodesRef}
      />
    </main>
  );
}
