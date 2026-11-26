'use client';

import { useEffect, useRef, useState } from 'react';

import MidweekWeek from '../../../components/MidweekWeek';
import PrintStage from '../../../components/PrintStage';
import { ExportMenu } from '../../../components/MeetingsPage';
import { FIXTURE_WEEKS, fixtureGetAssign } from '../../midweek-pdf/fixtureWeeks.mjs';

// LOCAL TEST ONLY. Renders the real 週中 匯出 menu (ExportMenu) next to the real
// card and the real off-screen PrintStage, with synthetic weeks, so
// tests/e2e/exports.e2e.mjs can open the menu and press every item exactly the
// way a person does. `?week=2` picks the cancelled week, `?editing=1` turns edit
// mode on (the mode where JPGs used to carry the edit bar).
export default function MidweekExportFixture({ weekIndex = 0, editing = false }) {
  const week = FIXTURE_WEEKS[weekIndex] ?? FIXTURE_WEEKS[0];
  const captureRef = useRef(null);
  const pdfNodesRef = useRef([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.body.classList.toggle('editing', Boolean(editing));
    return () => document.body.classList.remove('editing');
  }, [editing]);

  useEffect(() => {
    setReady(pdfNodesRef.current.length > 0);
  }, [weekIndex]);

  return (
    <main>
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <div className="toolbar">
        <ExportMenu
          week={week}
          getAssign={fixtureGetAssign}
          captureRef={captureRef}
          pdfNodesRef={pdfNodesRef}
          editMode={editing}
          exportOpen={exportOpen}
          setExportOpen={setExportOpen}
        />
      </div>
      <MidweekWeek
        week={week}
        editMode={editing}
        getAssign={fixtureGetAssign}
        openSheet={() => {}}
        updateMidweekWeek={() => {}}
        cardRef={captureRef}
      />
      <PrintStage nodesRef={pdfNodesRef}>
        <MidweekWeek
          week={week}
          editMode={false}
          getAssign={fixtureGetAssign}
          openSheet={() => {}}
          updateMidweekWeek={() => {}}
        />
      </PrintStage>
    </main>
  );
}
