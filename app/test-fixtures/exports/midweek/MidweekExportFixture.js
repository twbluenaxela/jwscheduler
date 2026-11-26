'use client';

import { useEffect, useRef, useState } from 'react';

import MidweekWeek from '../../../components/MidweekWeek';
import FitToScreen from '../../../components/FitToScreen';
import FixtureChrome from '../../FixtureChrome';
import PrintStage from '../../../components/PrintStage';
import { MidweekChrome } from '../../../components/MeetingsPage';
import { FIXTURE_WEEKS, fixtureGetAssign } from '../../midweek-pdf/fixtureWeeks.mjs';

// LOCAL TEST ONLY. Mounts the REAL 聚會 midweek chrome (MidweekChrome: the same
// toolbar, 週中/週末 tabs, ‹ WeekPicker › and navstrip the app renders) around
// the real card and off-screen PrintStage, with synthetic weeks. iPad layout
// audits therefore exercise the app's actual chrome, not a fixture mock.
export default function MidweekExportFixture({ weekIndex = 0, editing = false }) {
  const [week, setWeek] = useState(weekIndex);
  const [exportOpen, setExportOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const menuRef = useRef(null);
  const captureRef = useRef(null);
  const pdfNodesRef = useRef([]);
  const selected = FIXTURE_WEEKS[week] ?? FIXTURE_WEEKS[0];

  useEffect(() => { setWeek(weekIndex); }, [weekIndex]);
  useEffect(() => {
    document.body.classList.toggle('editing', Boolean(editing));
    return () => document.body.classList.remove('editing');
  }, [editing]);
  useEffect(() => {
    setReady(pdfNodesRef.current.length > 0);
  }, [weekIndex]);

  return (
    <FixtureChrome page="meetings">
      <p data-testid="fixture-status">{ready ? 'fixture ready' : 'fixture loading'}</p>
      <MidweekChrome
        weeks={FIXTURE_WEEKS}
        week={week}
        setWeek={setWeek}
        view="midweek"
        setView={() => {}}
        editMode={editing}
        setEditMode={() => {}}
        canEdit
        publishResult={null}
        publishing={false}
        onPublish={() => {}}
        onFinishEdit={() => {}}
        exportOpen={exportOpen}
        setExportOpen={setExportOpen}
        menuRef={menuRef}
        captureRef={captureRef}
        pdfNodesRef={pdfNodesRef}
        getAssign={fixtureGetAssign}
        hasMwSuggestions={false}
        mwPrefix={null}
        acceptAllSuggestions={() => {}}
        clearSuggestions={() => {}}
        setPage={() => {}}
        suggestingMw={false}
        setSuggestingMw={() => {}}
        fetchMidweekSuggestions={() => {}}
        onDeleteWeek={() => {}}
        updateMidweekWeek={() => {}}
      >
        <FitToScreen>
          <MidweekWeek
            week={selected}
            editMode={editing}
            getAssign={fixtureGetAssign}
            openSheet={() => {}}
            updateMidweekWeek={() => {}}
            cardRef={captureRef}
          />
        </FitToScreen>
        <PrintStage nodesRef={pdfNodesRef}>
          <MidweekWeek
            week={selected}
            editMode={false}
            getAssign={fixtureGetAssign}
            openSheet={() => {}}
            updateMidweekWeek={() => {}}
          />
        </PrintStage>
      </MidweekChrome>
    </FixtureChrome>
  );
}
