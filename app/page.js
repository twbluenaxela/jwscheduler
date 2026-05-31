'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import TabBar from './components/TabBar';
import MeetingsPage from './components/MeetingsPage';
import OverviewPage from './components/OverviewPage';
import PeoplePage from './components/PeoplePage';
import ImportPage from './components/ImportPage';
import AssignSheet from './components/AssignSheet';
import Toast from './components/Toast';
import { midweekWeeks as seedWeeks, weekendData as seedWeekendData } from './data/index';

export default function App() {
  const [page, setPage] = useState('meetings');
  const [midweekWeeks, setMidweekWeeks] = useState(seedWeeks);
  const [view, setView] = useState('midweek');
  const [week, setWeek] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [weekendFilter, setWeekendFilter] = useState('upcoming');
  const [weekendRows, setWeekendRows] = useState(() => seedWeekendData.map((r, i) => ({ ...r, _id: i })));
  const [weekendEditMode, setWeekendEditMode] = useState(false);
  const [weekendExportOpen, setWeekendExportOpen] = useState(false);
  const nextWeekendId = useRef(seedWeekendData.length);
  const [assignments, setAssignments] = useState({});
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);

  // Sync edit-mode body class for CSS
  useEffect(() => {
    document.body.classList.toggle('editing', editMode);
  }, [editMode]);

  const getAssign = useCallback((slotId, defaultName) => {
    return slotId in assignments ? assignments[slotId] : (defaultName ?? '');
  }, [assignments]);

  const updateMidweekWeek = useCallback((weekId, updater) => {
    setMidweekWeeks((prev) => prev.map((week) => (
      week.id === weekId ? updater(week) : week
    )));
  }, []);

  const addWeekendRow = useCallback((type = 'schedule') => {
    const id = nextWeekendId.current++;
    const row = type === 'event'
      ? { _id: id, date: '', type: 'event', label: '', note: '' }
      : { _id: id, date: '', no: '', topic: '', cong: '', speaker: '', chair: '', wt: '', read: '', host: '', away: '' };
    setWeekendRows(prev => [...prev, row]);
  }, []);

  const deleteWeekendRow = useCallback((rowId) => {
    setWeekendRows(prev => prev.filter(r => r._id !== rowId));
  }, []);

  const updateWeekendRow = useCallback((rowId, field, value) => {
    setWeekendRows(prev => prev.map(r => r._id === rowId ? { ...r, [field]: value } : r));
  }, []);

  const openSheet = useCallback((slotId, catKey, ctxLabel, currentName) => {
    setSheet({ slotId, catKey, ctxLabel, defaultName: currentName });
  }, []);

  const onPick = useCallback((slotId, name, prevName) => {
    setAssignments((prev) => ({ ...prev, [slotId]: name }));
    setSheet(null);
    setToast({
      msg: `已指派 ${name}`,
      undo: () => {
        setAssignments((prev) => {
          const next = { ...prev };
          if (prevName) next[slotId] = prevName;
          else delete next[slotId];
          return next;
        });
      },
    });
  }, []);

  const sharedProps = { getAssign, openSheet, updateMidweekWeek };
  const weekendProps = { weekendRows, weekendEditMode, setWeekendEditMode, weekendExportOpen, setWeekendExportOpen, addWeekendRow, deleteWeekendRow, updateWeekendRow };

  return (
    <>
      <div className="shell">
        <Sidebar page={page} setPage={setPage} />
        <TopBar page={page} />
        <div className="content">
          {page === 'meetings' && (
            <MeetingsPage
              midweekWeeks={midweekWeeks}
              view={view} setView={setView}
              week={week} setWeek={setWeek}
              editMode={editMode} setEditMode={setEditMode}
              exportOpen={exportOpen} setExportOpen={setExportOpen}
              weekendFilter={weekendFilter} setWeekendFilter={setWeekendFilter}
              {...sharedProps}
            />
          )}
          {page === 'overview' && <OverviewPage />}
          {page === 'people' && <PeoplePage />}
          {page === 'import' && (
            <ImportPage
              onImportWeeks={(weeks) => {
                setMidweekWeeks(weeks);
                setWeek(0);
                setPage('meetings');
              }}
            />
          )}
        </div>
      </div>
      <TabBar page={page} setPage={setPage} />

      {sheet && (
        <AssignSheet
          sheet={sheet}
          assignments={assignments}
          getAssign={getAssign}
          onPick={onPick}
          onClose={() => setSheet(null)}
        />
      )}

      {toast && (
        <Toast toast={toast} onHide={() => setToast(null)} />
      )}
    </>
  );
}
