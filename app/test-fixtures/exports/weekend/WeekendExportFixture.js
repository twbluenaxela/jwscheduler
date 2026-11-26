'use client';

import { useEffect, useRef, useState } from 'react';

import WeekendView from '../../../components/WeekendView';
import { WeekendExportMenu } from '../../../components/MeetingsPage';
import MountOnly from '../../MountOnly';
import { fixtureWeekendGetAssign, weekendFixtureRows } from '../../weekend-pdf/fixtureRows.mjs';

// LOCAL TEST ONLY. Renders the real 週末 匯出 menu (WeekendExportMenu) on top of
// the real WeekendView (live table + mobile cards + the print chunks), with
// synthetic rows, so tests/e2e/exports.e2e.mjs can press every item. `?editing=1`
// turns weekend edit mode on (the mode whose JPG used to be the edit-form table).
//
// MountOnly, because the e2e freezes the page clock: the year gate resolves
// year-less "M/D" against today, so server and client would disagree on which
// rows exist and React would report a hydration error that is not the export's.
export default function WeekendExportFixture({ editing = false }) {
  return (
    <MountOnly>
      <Body editing={editing} />
    </MountOnly>
  );
}

function Body({ editing }) {
  const [rows] = useState(weekendFixtureRows);
  const captureRef = useRef(null);
  const visibleRowsRef = useRef([]);
  const pdfNodesRef = useRef([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(pdfNodesRef.current.length > 0);
  }, []);

  return (
    <main>
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <div className="toolbar">
        <WeekendExportMenu
          getAssign={fixtureWeekendGetAssign}
          captureRef={captureRef}
          visibleRowsRef={visibleRowsRef}
          pdfNodesRef={pdfNodesRef}
          editMode={editing}
          exportOpen={exportOpen}
          setExportOpen={setExportOpen}
        />
      </div>
      <WeekendView
        filter="all"
        setFilter={() => {}}
        weekendRows={rows}
        getAssign={fixtureWeekendGetAssign}
        openSheet={() => {}}
        editMode={editing}
        updateRow={() => {}}
        deleteRow={() => {}}
        addRow={() => {}}
        captureRef={captureRef}
        visibleRowsRef={visibleRowsRef}
        printNodesRef={pdfNodesRef}
      />
    </main>
  );
}
