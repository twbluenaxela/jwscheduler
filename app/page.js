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
import { buildPastHistory, slotRefDate } from './lib/pastHistory.mjs';

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

function parseChineseDate(dateStr) {
  const m = String(dateStr ?? '').match(/(\d+)月\s*(\d+)日/);
  if (!m) return null;
  const mo = parseInt(m[1]), day = parseInt(m[2]);
  const now = new Date();
  let year = now.getFullYear();
  if (mo < now.getMonth() + 1 - 6) year++;
  else if (mo > now.getMonth() + 1 + 6) year--;
  return new Date(year, mo - 1, day);
}

function findCurrentWeekIndex(weeks) {
  if (!weeks.length) return 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let fallback = 0;
  for (let i = 0; i < weeks.length; i++) {
    const start = parseChineseDate(weeks[i].weekStart || weeks[i].date);
    if (!start) continue;
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    if (today >= start && today <= end) return i;
    if (start <= today) fallback = i;
  }
  return fallback;
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

function OnboardingScreen() {
  const { setDbUser } = useAuth();
  const [congregations, setCongregations] = useState([]);
  const [code, setCode] = useState('');
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch('/api/congregations/list', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok) setCongregations(data.congregations);
      } catch {}
    })();
  }, []);

  async function join(e) {
    e.preventDefault();
    const payload = code.trim() ? { code: code.trim() } : (selected ? { congregationId: Number(selected) } : null);
    if (!payload) return;
    setError(''); setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/congregations/join', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDbUser(data.user);
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
            <div className="login-brand__sub">請輸入會眾代碼以檢視安排</div>
          </div>
        </div>

        <form onSubmit={join} className="login-form">
          <div className="login-field">
            <label className="login-label">會眾代碼</label>
            <input
              className="login-input"
              value={code}
              onChange={(e) => { setCode(e.target.value); if (e.target.value) setSelected(''); }}
              placeholder="例：xinwu"
              autoCapitalize="none"
            />
          </div>
          {congregations.length > 0 && (
            <div className="login-field">
              <label className="login-label">或從清單選擇</label>
              <select
                className="login-input"
                value={selected}
                onChange={(e) => { setSelected(e.target.value); if (e.target.value) setCode(''); }}
              >
                <option value="">—</option>
                {congregations.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}（{c.code}）</option>
                ))}
              </select>
            </div>
          )}
          {error && <div className="login-error">{error}</div>}
          <button className="btn btn--primary login-submit" disabled={loading || (!code.trim() && !selected)}>
            {loading ? '加入中…' : '以檢視者身份加入'}
          </button>
        </form>
        <p className="settings-hint" style={{ marginTop: 12 }}>
          加入後預設為唯讀檢視者，編排權限由管理員授予。會眾代碼可向該會眾管理員索取。
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const { firebaseUser, dbUser, dbSyncing, syncError } = useAuth();
  const router = useRouter();
  const role = dbUser?.role;
  const isSysadmin = role === 'SYSADMIN';
  const canEdit = role === 'ADMIN' || role === 'SYSADMIN';
  const [page, setPage] = useState('meetings');
  const [midweekWeeks, setMidweekWeeks] = useState([]);
  const [view, setView] = useState('midweek');
  const [week, setWeek] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [congSettings, setCongSettings] = useState({ dayOffset: 2, time: '19:30' });
  const [people, setPeople] = useState([]);
  const [congCode, setCongCode] = useState('');
  const [workspaceLoading, setWorkspaceLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('jwscheduler_congSettings');
    if (saved) try { setCongSettings(JSON.parse(saved)); } catch {}
  }, []);

  // Viewers are read-only: they can't open the import/export or 人員 pages.
  useEffect(() => {
    if (!canEdit && (page === 'import' || page === 'people')) setPage('meetings');
  }, [canEdit, page]);

  // Auth-driven navigation — must run in an effect, never during render.
  useEffect(() => {
    if (firebaseUser === undefined || dbSyncing) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    if (dbUser && !dbUser.congregationId && isSysadmin) router.replace('/admin');
  }, [firebaseUser, dbSyncing, dbUser, isSysadmin, router]);

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
  const [suggestions, setSuggestions] = useState({});
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!dbUser?.congregationId) return;
    let cancelled = false;

    async function loadWorkspace() {
      setWorkspaceLoading(true);
      try {
        const token = await getToken();
        const res = await fetch('/api/congregations/data', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '載入會眾資料失敗');
        if (cancelled) return;

        setPeople(data.people ?? []);
        const loadedWeeks = (data.midweekWeeks ?? []).slice().sort((a, b) => {
          const da = parseChineseDate(a.weekStart || a.date);
          const db = parseChineseDate(b.weekStart || b.date);
          if (!da && !db) return 0;
          if (!da) return 1;
          if (!db) return -1;
          return da - db;
        });
        setMidweekWeeks(loadedWeeks);
        setWeek(findCurrentWeekIndex(loadedWeeks));
        setWeekendRows(data.weekendRows ?? []);

        // Populate assignments map from DB data
        const initialAssignments = {};
        for (const w of loadedWeeks) {
          if (w.chairman) initialAssignments[`mw${w.id}_chairman`] = w.chairman;
          if (w.openPrayer) initialAssignments[`mw${w.id}_openPrayer`] = w.openPrayer;
          if (w.closePrayer) initialAssignments[`mw${w.id}_closePrayer`] = w.closePrayer;
          for (const section of ['treasures', 'ministry', 'living']) {
            for (const part of w[section] ?? []) {
              if (part.assign?.[0]) initialAssignments[`mw${w.id}_${part.id}_0`] = part.assign[0];
              if (part.assign?.[1]) initialAssignments[`mw${w.id}_${part.id}_1`] = part.assign[1];
            }
          }
        }
        setAssignments(initialAssignments);
        nextWeekendId.current = (data.weekendRows ?? []).reduce((max, row) => Math.max(max, Number(row._id) || 0), 0) + 1;
        if (data.congregation) {
          setCongSettings({
            dayOffset: data.congregation.meetingDayOffset ?? 2,
            time: data.congregation.meetingTime ?? '19:30',
            exceptions: data.congregation.exceptions ?? [],
          });
          if (data.congregation.code) setCongCode(data.congregation.code);
        }
      } catch (err) {
        if (!cancelled) setToast({ msg: err.message });
      } finally {
        if (!cancelled) setWorkspaceLoading(false);
      }
    }

    loadWorkspace();
    return () => { cancelled = true; };
  }, [dbUser?.congregationId]);

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

  const saveMidweekWeek = useCallback(async (weekObj) => {
    if (!weekObj?.id) return;
    try {
      const token = await getToken();
      const allParts = [
        ...(weekObj.treasures ?? []),
        ...(weekObj.ministry ?? []),
        ...(weekObj.living ?? []),
      ];
      await fetch(`/api/midweek-weeks/${weekObj.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: weekObj.date,
          dateLabel: weekObj.dateLabel,
          weekdayPill: weekObj.weekdayPill,
          reading: weekObj.reading,
          openSong: weekObj.openSong,
          midSong: weekObj.midSong,
          closeSong: weekObj.closeSong,
          openIntroTime: weekObj.openIntroTime,
          midSongTime: weekObj.midSongTime,
          closingTime: weekObj.closingTime,
          closingDur: weekObj.closingDur,
          closeSongTime: weekObj.closeSongTime,
          parts: allParts.map((p) => ({ id: p.dbId, title: p.title, dur: p.dur, time: p.time })),
        }),
      });
    } catch (err) {
      setToast({ msg: `儲存失敗：${err.message}` });
    }
  }, []);

  const deleteMidweekWeek = useCallback(async (weekId) => {
    const idx = midweekWeeks.findIndex((w) => w.id === weekId);
    setMidweekWeeks((prev) => prev.filter((w) => w.id !== weekId));
    setWeek((prev) => Math.max(0, prev > idx ? prev - 1 : prev));
    try {
      const token = await getToken();
      const res = await fetch(`/api/midweek-weeks/${weekId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setToast({ msg: `刪除失敗：${err.message}` });
    }
  }, [midweekWeeks]);

  const addWeekendRow = useCallback(async (type = 'schedule') => {
    const tempId = `temp-${nextWeekendId.current++}`;
    const defaultDate = (() => {
      for (let i = weekendRows.length - 1; i >= 0; i--) {
        const m = String(weekendRows[i].date ?? '').match(/^(\d+)\/(\d+)$/);
        if (m) {
          const now = new Date();
          let yr = now.getFullYear();
          const mo = parseInt(m[1]);
          if (mo < now.getMonth() + 1 - 6) yr++;
          else if (mo > now.getMonth() + 1 + 6) yr--;
          const d = new Date(yr, mo - 1, parseInt(m[2]));
          d.setDate(d.getDate() + 7);
          return `${d.getMonth() + 1}/${d.getDate()}`;
        }
      }
      const d = new Date();
      const toSun = (7 - d.getDay()) % 7 || 7;
      d.setDate(d.getDate() + toSun);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    })();
    const optimistic = type === 'event'
      ? { _id: tempId, date: defaultDate, type: 'event', label: '', note: '' }
      : { _id: tempId, date: defaultDate, no: '', topic: '', cong: '', speaker: '', chair: '', wt: '', read: '', host: '', away: '' };
    setWeekendRows(prev => [...prev, optimistic]);
    try {
      const token = await getToken();
      const res = await fetch('/api/weekend-rows', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, date: defaultDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setWeekendRows(prev => prev.map(r => r._id === tempId ? { ...data.row, _id: data.row.id } : r));
    } catch (err) {
      setWeekendRows(prev => prev.filter(r => r._id !== tempId));
      setToast({ msg: `新增失敗：${err.message}` });
    }
  }, [weekendRows]);

  const deleteWeekendRow = useCallback(async (rowId) => {
    setWeekendRows(prev => prev.filter(r => r._id !== rowId));
    if (String(rowId).startsWith('temp-')) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/weekend-rows/${rowId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setToast({ msg: `刪除失敗：${err.message}` });
    }
  }, []);

  const persistWeekendField = useCallback(async (rowId, field, value) => {
    if (String(rowId).startsWith('temp-')) return;
    try {
      const token = await getToken();
      const res = await fetch(`/api/weekend-rows/${rowId}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setToast({ msg: `儲存失敗：${err.message}` });
    }
  }, []);

  const updateWeekendRow = useCallback((rowId, field, value) => {
    setWeekendRows(prev => prev.map(r => r._id === rowId ? { ...r, [field]: value } : r));
  }, []);

  const saveImportedWeeks = useCallback(async (weeks) => {
    const token = await getToken();
    const res = await fetch('/api/midweek-weeks/import', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ weeks }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '儲存匯入資料失敗');
    return data.weeks ?? [];
  }, []);

  const openSheet = useCallback((slotId, catKey, ctxLabel, currentName) => {
    if (!canEdit) return; // viewers are read-only: no assigning
    setSheet({ slotId, catKey, ctxLabel, defaultName: currentName });
  }, [canEdit]);

  async function persistAssignment(slotId, name) {
    try {
      const token = await getToken();
      const weMatch = slotId.match(/^we(\d+)_(.+)$/);
      if (weMatch) {
        const [, rowId, field] = weMatch;
        const res = await fetch(`/api/weekend-rows/${rowId}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: name }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        updateWeekendRow(Number(rowId), field, name);
        return;
      }
      const res = await fetch('/api/assignments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slotId, name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
    } catch (err) {
      setToast({ msg: `儲存失敗：${err.message}` });
    }
  }

  const onPick = useCallback((slotId, name, prevName) => {
    setAssignments((prev) => ({ ...prev, [slotId]: name }));
    setSheet(null);
    persistAssignment(slotId, name);
    setToast({
      msg: name ? `已指派 ${name}` : '已清除指派',
      undo: () => {
        const restoreName = prevName ?? '';
        setAssignments((prev) => {
          const next = { ...prev };
          if (prevName) next[slotId] = prevName;
          else delete next[slotId];
          return next;
        });
        persistAssignment(slotId, restoreName);
      },
    });
  }, []);

  const clearSlot = useCallback((slotId) => {
    setAssignments(prev => { const next = { ...prev }; delete next[slotId]; return next; });
    persistAssignment(slotId, '');
  }, []);

  const getSuggestion = useCallback((slotId) => {
    if (assignments[slotId]) return null;
    return suggestions[slotId] ?? null;
  }, [assignments, suggestions]);

  const clearSuggestions = useCallback((prefix = '') => {
    setSuggestions(prev => {
      if (!prefix) return {};
      const next = { ...prev };
      for (const k of Object.keys(next)) { if (k.startsWith(prefix)) delete next[k]; }
      return next;
    });
  }, []);

  const acceptSuggestion = useCallback((slotId, name) => {
    setSuggestions(prev => { const n = { ...prev }; delete n[slotId]; return n; });
    onPick(slotId, name, assignments[slotId] ?? '');
  }, [assignments, onPick]);

  const acceptAllSuggestions = useCallback((prefix = '') => {
    const entries = Object.entries(suggestions).filter(([k]) => !prefix || k.startsWith(prefix));
    if (!entries.length) return;
    const snap = Object.fromEntries(entries.map(([k]) => [k, assignments[k] ?? '']));
    setAssignments(prev => ({ ...prev, ...Object.fromEntries(entries) }));
    setSuggestions(prev => {
      const n = { ...prev };
      for (const [k] of entries) delete n[k];
      return n;
    });
    for (const [slotId, name] of entries) persistAssignment(slotId, name);
    setToast({
      msg: `已接受 ${entries.length} 項建議`,
      undo: () => {
        setAssignments(prev => {
          const n = { ...prev };
          for (const [k, v] of Object.entries(snap)) { if (v) n[k] = v; else delete n[k]; }
          return n;
        });
        for (const [slotId, prev] of Object.entries(snap)) persistAssignment(slotId, prev ?? '');
      },
    });
  }, [suggestions, assignments]);

  const fetchWeekendSuggestions = useCallback(async (rowId, existing = {}) => {
    try {
      const token = await getToken();
      // Pass the row's own date so recency/past-only is measured from that meeting.
      const rowDate = weekendRows.find(r => r._id === rowId)?.date;
      const res = await fetch('/api/suggest/weekend-row', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ existing, date: rowDate }),
      });
      if (!res.ok) return;
      const { suggestion } = await res.json();
      const key = `we${rowId}`;
      setSuggestions(prev => ({
        ...prev,
        ...(suggestion.speaker ? { [`${key}_speaker`]: suggestion.speaker } : {}),
        ...(suggestion.chair   ? { [`${key}_chair`]:   suggestion.chair   } : {}),
        ...(suggestion.wt      ? { [`${key}_wt`]:      suggestion.wt      } : {}),
        ...(suggestion.read    ? { [`${key}_read`]:     suggestion.read    } : {}),
      }));
    } catch { /* silent */ }
  }, [weekendRows]);

  const fetchMidweekSuggestions = useCallback(async (weekId) => {
    try {
      const token = await getToken();
      const prefix = `mw${weekId}_`;
      const weekAssignments = Object.fromEntries(
        Object.entries(assignments).filter(([k]) => k.startsWith(prefix))
      );
      const res = await fetch('/api/suggest/midweek-week', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekId, assignments: weekAssignments }),
      });
      if (!res.ok) return;
      const { suggestions: result } = await res.json();
      setSuggestions(prev => ({ ...prev, ...result }));
    } catch { /* silent */ }
  }, [assignments]);

  const ghostProps = {
    getSuggestion,
    onAccept: acceptSuggestion,
    onClear: useCallback((slotId) => setSuggestions(prev => { const n = { ...prev }; delete n[slotId]; return n; }), []),
  };

  const sharedProps = { getAssign, openSheet, updateMidweekWeek, saveMidweekWeek, deleteMidweekWeek, clearSlot, ...ghostProps };
  const weekendProps = { weekendRows, weekendEditMode, setWeekendEditMode, weekendExportOpen, setWeekendExportOpen, addWeekendRow, deleteWeekendRow, updateWeekendRow, persistWeekendField, fetchWeekendSuggestions };

  const scheduleStats = (() => {
    if (!midweekWeeks.length) return null;
    const upcoming = midweekWeeks.slice(week);
    let vacancies = 0;
    for (const w of upcoming) {
      const fixed = ['chairman', 'openPrayer', 'closePrayer'];
      for (const key of fixed) {
        if (!(assignments[`mw${w.id}_${key}`] ?? w[key] ?? '')) vacancies++;
      }
      for (const section of ['treasures', 'ministry', 'living']) {
        for (const part of (w[section] ?? [])) {
          const primary = assignments[`mw${w.id}_${part.id}_0`] ?? part.assign?.[0] ?? '';
          if (!primary) vacancies++;
        }
      }
    }
    const currentWeek = midweekWeeks[week];
    return {
      weekCount: midweekWeeks.length,
      nextDate: currentWeek?.date ?? null,
      meetingTime: congSettings.time ?? '19:30',
      vacancies,
      upcomingWeeks: upcoming.length,
    };
  })();

  // ── Auth gating ──────────────────────────────────────────────────────────────
  if (firebaseUser === undefined || dbSyncing) {
    return <div className="login-shell"><div className="login-card" style={{alignItems:'center'}}><div className="spin" style={{fontSize:28}}>⟳</div><div className="login-brand__sub">載入中…</div></div></div>;
  }
  if (!firebaseUser) {
    return null; // redirect to /login handled in effect
  }
  if (syncError) {
    return (
      <div className="login-shell">
        <div className="login-card" style={{alignItems:'center', gap:16}}>
          <div className="login-brand__title">連線錯誤</div>
          <div className="login-brand__sub" style={{color:'var(--special)', textAlign:'center'}}>{syncError}</div>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>重新載入</button>
        </div>
      </div>
    );
  }
  if (!dbUser?.congregationId) {
    if (isSysadmin) return null; // redirect to /admin handled in effect
    return <OnboardingScreen />;
  }

  const congName = dbUser?.congregation?.name;

  return (
    <>
      <div className="shell">
        <Sidebar page={page} setPage={setPage} congName={congName} scheduleStats={scheduleStats} role={role} onAdmin={() => router.push('/admin')} />
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
              {...weekendProps}
              setPage={setPage}
              canEdit={canEdit}
              {...sharedProps}
              suggestions={suggestions}
              fetchMidweekSuggestions={fetchMidweekSuggestions}
              acceptAllSuggestions={acceptAllSuggestions}
              clearSuggestions={clearSuggestions}
            />
          )}
          {page === 'overview' && (
            <OverviewPage
              midweekWeeks={midweekWeeks}
              weekendRows={weekendRows}
              loading={workspaceLoading}
              canEdit={canEdit}
            />
          )}
          {page === 'people' && (
            <PeoplePage
              people={people}
              setPeople={setPeople}
              midweekWeeks={midweekWeeks}
              weekendRows={weekendRows}
              loading={workspaceLoading}
              congCode={congCode}
              canEdit={canEdit}
            />
          )}
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
              getAssign={getAssign}
              congSettings={congSettings}
              setCongSettings={setCongSettings}
              onReapplySchedule={() => {
                setMidweekWeeks(prev => prev.map(w => {
                  if (!w.weekStart) return w;
                  const { dayOffset, time } = getEffectiveSchedule(w.weekStart, congSettings);
                  return { ...w, date: shiftDate(w.weekStart, dayOffset), weekdayPill: `${DAY_NAMES[dayOffset]} · ${time}` };
                }));
              }}
              onImportWeeks={async (weeks) => {
                const adjusted = weeks.map(w => {
                  const weekStart = w.date; // EPUB date is always the Monday
                  const { dayOffset, time } = getEffectiveSchedule(weekStart, congSettings);
                  return { ...w, weekStart, date: shiftDate(weekStart, dayOffset), weekdayPill: `${DAY_NAMES[dayOffset]} · ${time}` };
                });
                const savedWeeks = await saveImportedWeeks(adjusted);
                const merged = [...midweekWeeks];
                for (const w of savedWeeks) {
                  const idx = merged.findIndex((e) => (
                    e.id === w.id || (w.weekStart && e.weekStart === w.weekStart) || e.date === w.date
                  ));
                  if (idx >= 0) merged[idx] = w;
                  else merged.push(w);
                }
                merged.sort((a, b) => {
                  const da = parseChineseDate(a.weekStart || a.date);
                  const db = parseChineseDate(b.weekStart || b.date);
                  if (!da && !db) return 0;
                  if (!da) return 1;
                  if (!db) return -1;
                  return da - db;
                });
                setMidweekWeeks(merged);
                setWeek(findCurrentWeekIndex(merged));
                setPage('meetings');
              }}
              onResetWeeks={() => {
                setMidweekWeeks(seedWeeks);
                setWeekendRows(seedWeekendData.map((r, i) => ({ ...r, _id: i })));
                nextWeekendId.current = seedWeekendData.length;
                setWeek(findCurrentWeekIndex(seedWeeks));
              }}
            />
          )}
        </div>
      </div>
      <TabBar page={page} setPage={setPage} role={role} />

      {sheet && (
        <AssignSheet
          sheet={sheet}
          assignments={assignments}
          getAssign={getAssign}
          onPick={onPick}
          onClose={() => setSheet(null)}
          people={people}
          pastHistory={buildPastHistory(midweekWeeks, assignments, weekendRows, slotRefDate(sheet.slotId, midweekWeeks, weekendRows))}
        />
      )}

      {toast && (
        <Toast toast={toast} onHide={() => setToast(null)} />
      )}
    </>
  );
}
