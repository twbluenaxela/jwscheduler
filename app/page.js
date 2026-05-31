'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth, getToken } from './lib/auth-context';
import { useRouter } from 'next/navigation';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import TabBar from './components/TabBar';
import MeetingsPage from './components/MeetingsPage';
import OverviewPage from './components/OverviewPage';
import PeoplePage from './components/PeoplePage';
import ImportPage from './components/ImportPage';
import SettingsPage from './components/SettingsPage';
import AssignSheet from './components/AssignSheet';
import Toast from './components/Toast';
import { midweekWeeks as seedWeeks, weekendData as seedWeekendData } from './data/index';

const DAY_NAMES = ['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];

function shiftDate(dateStr, offsetDays) {
  if (!offsetDays) return dateStr;
  const m = String(dateStr ?? '').match(/(\d+)月\s*(\d+)日/);
  if (!m) return dateStr;
  const year = new Date().getFullYear();
  const d = new Date(year, parseInt(m[1]) - 1, parseInt(m[2]) + offsetDays);
  return `${d.getMonth() + 1}月 ${d.getDate()}日`;
}

function dateKey(dateStr) {
  const m = String(dateStr ?? '').match(/(\d+)月\s*(\d+)日/);
  return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0;
}

function getEffectiveSchedule(weekStart, settings) {
  const key = dateKey(weekStart);
  for (const exc of settings.exceptions ?? []) {
    const from = exc.fromMonth * 100 + (exc.fromDay ?? 1);
    const to   = exc.toMonth   * 100 + (exc.toDay   ?? 31);
    if (key >= from && key <= to) return { dayOffset: exc.dayOffset, time: exc.time };
  }
  return { dayOffset: settings.dayOffset, time: settings.time };
}

function OnboardingScreen({ onCreated, onJoined }) {
  const { dbUser, setDbUser } = useAuth();
  const [mode, setMode] = useState('choose'); // choose | create | join
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [inviteToken, setInviteToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function create(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/congregations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDbUser(data.user);
      onCreated?.(data.congregation);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function join(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const token = await getToken();
      // Support full URL or bare token
      const bare = inviteToken.includes('/join/') ? inviteToken.split('/join/')[1] : inviteToken.trim();
      const res = await fetch('/api/congregations/join', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken: bare }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDbUser(data.user);
      onJoined?.(data.congregation);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand__icon">📅</span>
          <div>
            <div className="login-brand__title">歡迎使用聚會編排系統</div>
            <div className="login-brand__sub">請先建立或加入一個會眾</div>
          </div>
        </div>

        {mode === 'choose' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button className="btn btn--primary" style={{ padding: '12px', fontSize: 15 }} onClick={() => setMode('create')}>建立新會眾</button>
            <button className="btn" style={{ padding: '12px', fontSize: 15 }} onClick={() => setMode('join')}>加入現有會眾</button>
          </div>
        )}

        {mode === 'create' && (
          <form onSubmit={create} className="login-form">
            <div className="login-field">
              <label className="login-label">會眾名稱</label>
              <input className="login-input" placeholder="例：新屋會眾" value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="login-field">
              <label className="login-label">代碼（英文小寫）</label>
              <input className="login-input" placeholder="例：xinwu" value={code} onChange={e => setCode(e.target.value)} required />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button className="btn btn--primary login-submit" disabled={loading}>{loading ? '建立中…' : '建立會眾'}</button>
            <button type="button" className="btn" onClick={() => setMode('choose')}>返回</button>
          </form>
        )}

        {mode === 'join' && (
          <form onSubmit={join} className="login-form">
            <div className="login-field">
              <label className="login-label">邀請連結或代碼</label>
              <input className="login-input" placeholder="貼上邀請連結或代碼" value={inviteToken} onChange={e => setInviteToken(e.target.value)} required />
            </div>
            {error && <div className="login-error">{error}</div>}
            <button className="btn btn--primary login-submit" disabled={loading}>{loading ? '加入中…' : '加入會眾'}</button>
            <button type="button" className="btn" onClick={() => setMode('choose')}>返回</button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const { firebaseUser, dbUser } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState('meetings');
  const [midweekWeeks, setMidweekWeeks] = useState([]);
  const [view, setView] = useState('midweek');
  const [week, setWeek] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [congSettings, setCongSettings] = useState({ dayOffset: 2, time: '19:30' });

  useEffect(() => {
    const saved = localStorage.getItem('jwscheduler_congSettings');
    if (saved) try { setCongSettings(JSON.parse(saved)); } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('jwscheduler_congSettings', JSON.stringify(congSettings));
  }, [congSettings]);
  const [exportOpen, setExportOpen] = useState(false);
  const [weekendFilter, setWeekendFilter] = useState('upcoming');
  const [weekendRows, setWeekendRows] = useState([]);
  const [weekendEditMode, setWeekendEditMode] = useState(false);
  const [weekendExportOpen, setWeekendExportOpen] = useState(false);
  const nextWeekendId = useRef(0);
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

  // ── Auth gating ──────────────────────────────────────────────────────────────
  if (firebaseUser === undefined) {
    return <div className="login-shell"><div className="login-card" style={{alignItems:'center'}}><div className="spin" style={{fontSize:28}}>⟳</div><div className="login-brand__sub">載入中…</div></div></div>;
  }
  if (!firebaseUser) {
    // Redirect handled by router — show nothing while navigating
    if (typeof window !== 'undefined') router.replace('/login');
    return null;
  }
  if (dbUser && !dbUser.congregationId) {
    return <OnboardingScreen />;
  }

  const congName = dbUser?.congregation?.name;

  return (
    <>
      <div className="shell">
        <Sidebar page={page} setPage={setPage} congName={congName} />
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
              setPage={setPage}
              {...sharedProps}
            />
          )}
          {page === 'overview' && <OverviewPage />}
          {page === 'people' && <PeoplePage />}
          {page === 'settings' && (
            <SettingsPage
              congSettings={congSettings}
              setCongSettings={setCongSettings}
              existingWeeks={midweekWeeks}
              onReapplySchedule={() => {
                setMidweekWeeks(prev => prev.map(w => {
                  if (!w.weekStart) return w;
                  const { dayOffset, time } = getEffectiveSchedule(w.weekStart, congSettings);
                  return { ...w, date: shiftDate(w.weekStart, dayOffset), weekdayPill: `${DAY_NAMES[dayOffset]} · ${time}` };
                }));
              }}
            />
          )}
          {page === 'import' && (
            <ImportPage
              existingWeeks={midweekWeeks}
              congSettings={congSettings}
              setCongSettings={setCongSettings}
              onReapplySchedule={() => {
                setMidweekWeeks(prev => prev.map(w => {
                  if (!w.weekStart) return w;
                  const { dayOffset, time } = getEffectiveSchedule(w.weekStart, congSettings);
                  return { ...w, date: shiftDate(w.weekStart, dayOffset), weekdayPill: `${DAY_NAMES[dayOffset]} · ${time}` };
                }));
              }}
              onImportWeeks={(weeks) => {
                const adjusted = weeks.map(w => {
                  const weekStart = w.date; // EPUB date is always the Monday
                  const { dayOffset, time } = getEffectiveSchedule(weekStart, congSettings);
                  return { ...w, weekStart, date: shiftDate(weekStart, dayOffset), weekdayPill: `${DAY_NAMES[dayOffset]} · ${time}` };
                });
                setMidweekWeeks((prev) => {
                  const result = [...prev];
                  let nextId = Math.max(...prev.map((w) => (typeof w.id === 'number' ? w.id : 0))) + 1;
                  for (const w of adjusted) {
                    const idx = result.findIndex((e) => e.date === w.date);
                    if (idx >= 0) {
                      result[idx] = { ...w, id: result[idx].id };
                    } else {
                      result.push({ ...w, id: nextId++ });
                    }
                  }

                  result.sort((a, b) => {
                    const parse = (d) => { const m = String(d ?? '').match(/(\d+)月\s*(\d+)日/); return m ? parseInt(m[1]) * 100 + parseInt(m[2]) : 0; };
                    return parse(a.date) - parse(b.date);
                  });
                  return result;
                });
                setWeek(0);
                setPage('meetings');
              }}
              onResetWeeks={() => {
                setMidweekWeeks(seedWeeks);
                setWeekendRows(seedWeekendData.map((r, i) => ({ ...r, _id: i })));
                nextWeekendId.current = seedWeekendData.length;
                setWeek(0);
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
