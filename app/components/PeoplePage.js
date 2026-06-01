'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getToken } from '../lib/auth-context';

const QUAL_OPTIONS = [
  '主席',
  '禱告',
  '寶藏演講',
  '經文寶石',
  '經文朗讀',
  '傳道示範',
  '助手',
  '生活演講',
  '研經班主持',
  '研經班朗讀',
  '守望台朗讀',
  '公眾演講',
];

const OFFICE_OPTIONS = {
  M: ['長老', '助理僕人', '傳道員', '未受浸傳道員'],
  F: ['傳道員', '未受浸傳道員'],
};

const DEFAULT_OFFICE = '傳道員';

function collectUpcomingAssignments(name, midweekWeeks, weekendRows) {
  const items = [];

  midweekWeeks.forEach((week) => {
    if (week.chairman === name) {
      items.push({ date: week.date, label: '主席', context: week.weekdayPill });
    }
    if (week.openPrayer === name) {
      items.push({ date: week.date, label: '開始禱告', context: week.weekdayPill });
    }
    if (week.closePrayer === name) {
      items.push({ date: week.date, label: '結束禱告', context: week.weekdayPill });
    }
    week.treasures.forEach((part) => {
      if (part.assign.includes(name)) {
        items.push({ date: week.date, label: part.title, context: week.weekdayPill });
      }
    });
    week.ministry.forEach((part) => {
      if (part.assign.includes(name)) {
        items.push({ date: week.date, label: part.title, context: week.weekdayPill });
      }
    });
    week.living.forEach((part) => {
      if (part.assign.includes(name)) {
        items.push({ date: week.date, label: part.title, context: week.weekdayPill });
      }
    });
  });

  weekendRows.forEach((row) => {
    if (row.type === 'event') return;
    if (row.speaker === name) items.push({ date: row.date, label: '公眾演講', context: row.topic });
    if (row.chair === name) items.push({ date: row.date, label: '主席', context: row.topic });
    if (row.wt === name) items.push({ date: row.date, label: '守望台主持', context: row.topic });
    if (row.read === name) items.push({ date: row.date, label: '朗讀', context: row.topic });
    if (row.host === name) items.push({ date: row.date, label: '招待', context: row.topic });
  });

  return items.slice(0, 8);
}

function createBlankPerson(nextId) {
  return {
    id: `new-${nextId}`,
    name: `未命名人員 ${nextId}`,
    g: 'M',
    appt: DEFAULT_OFFICE,
    quals: [],
    recent: [],
  };
}

export default function PeoplePage({ people, setPeople, midweekWeeks = [], weekendRows = [], loading = false }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [nextId, setNextId] = useState(1);
  const [error, setError] = useState('');
  const [localName, setLocalName] = useState('');
  const prevSelectedIdRef = useRef('');

  const filteredPeople = useMemo(() => {
    return people.filter((person) => !query || person.name.includes(query));
  }, [people, query]);

  const selectedPerson = people.find((person) => person.id === selectedId) ?? filteredPeople[0] ?? people[0];

  // Sync localName only when the selected person changes, not on every API response
  useEffect(() => {
    const currentId = selectedPerson?.id ?? '';
    if (prevSelectedIdRef.current !== currentId) {
      prevSelectedIdRef.current = currentId;
      setLocalName(selectedPerson?.name ?? '');
    }
  });

  const upcoming = useMemo(() => {
    if (!selectedPerson?.name) return [];
    return collectUpcomingAssignments(selectedPerson.name, midweekWeeks, weekendRows);
  }, [selectedPerson, midweekWeeks, weekendRows]);

  async function persistPerson(person, changes) {
    if (!person || String(person.id).startsWith('new-')) return;
    const token = await getToken();
    const res = await fetch(`/api/people/${person.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '儲存人員失敗');
    setPeople((prev) => prev.map((item) => (item.id === person.id ? data.person : item)));
  }

  function updateSelected(changes) {
    if (!selectedPerson) return;
    setError('');
    setPeople((prev) => prev.map((person) => (person.id === selectedPerson.id ? { ...person, ...changes } : person)));
    persistPerson(selectedPerson, changes).catch((err) => setError(err.message));
  }

  function toggleQualification(qual) {
    if (!selectedPerson) return;
    const next = selectedPerson.quals.includes(qual)
      ? selectedPerson.quals.filter((item) => item !== qual)
      : [...selectedPerson.quals, qual];
    updateSelected({ quals: next });
  }

  function setGender(gender) {
    const allowed = OFFICE_OPTIONS[gender] ?? OFFICE_OPTIONS.M;
    const current = selectedPerson.appt && selectedPerson.appt !== '—' ? selectedPerson.appt : DEFAULT_OFFICE;
    updateSelected({
      g: gender,
      appt: allowed.includes(current) ? current : DEFAULT_OFFICE,
    });
  }

  async function addPerson() {
    setError('');
    const names = new Set(people.map((person) => person.name));
    let candidateId = nextId;
    while (names.has(`未命名人員 ${candidateId}`)) candidateId += 1;

    const fresh = createBlankPerson(candidateId);
    setPeople((prev) => [fresh, ...prev]);
    setSelectedId(fresh.id);
    setNextId(candidateId + 1);
    setQuery('');
    try {
      const token = await getToken();
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(fresh),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '新增人員失敗');
      setPeople((prev) => prev.map((person) => (person.id === fresh.id ? data.person : person)));
      setSelectedId(data.person.id);
    } catch (err) {
      setPeople((prev) => prev.filter((person) => person.id !== fresh.id));
      setError(err.message);
    }
  }

  return (
    <section>
      <div className="people-header">
        <div>
          <div className="toolbar">
            <span className="toolbar__title">人員 · 共 {people.length} 位</span>
          </div>
        </div>

        <div className="people-tools">
          <div className="search">
            <span className="search__ic">⌕</span>
            <input
              placeholder="搜尋姓名…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn btn--primary" onClick={addPerson}>＋ 新增人員</button>
        </div>
      </div>

      {error && <div className="imp-error">{error}</div>}

      <div className="people-subtitle">
        {loading ? (
          <span>正在載入會眾人員資料…</span>
        ) : query ? (
          <span>搜尋「{query}」· 找到 {filteredPeople.length} 位</span>
        ) : people.length === 0 ? (
          <span>目前這個會眾還沒有建立人員資料。</span>
        ) : (
          <span>以名單為核心的卡片檢視，適合快速查看資格與個人安排。</span>
        )}
      </div>

      <div className="people-layout">
        <div className="people-list">
          {filteredPeople.length > 0 ? filteredPeople.map((person) => (
            <button
              key={person.id}
              className={`person${selectedPerson?.id === person.id ? ' is-selected' : ''}`}
              onClick={() => setSelectedId(person.id)}
            >
              <span className={`avatar ${person.g === 'M' ? 'g-m' : 'g-f'}`}>
                {person.name.slice(0, 1) || '＋'}
              </span>
              <div className="person__body">
                <div className="person__top">
                  <span className="person__name">{person.name || '未命名人員'}</span>
                  <span className={`g-badge ${person.g === 'M' ? 'g-m' : 'g-f'}`}>
                    {person.g === 'M' ? '弟兄' : '姊妹'}
                  </span>
                  {person.appt && person.appt !== '—' && <span className="appt">{person.appt}</span>}
                </div>
                <div className="quals">
                  {person.quals.slice(0, 4).map((qual) => (
                    <span key={qual} className="qual">{qual}</span>
                  ))}
                </div>
              </div>
              <span className="ov-caret">›</span>
            </button>
          )) : (
            <div className="people-empty">
              沒有符合條件的人員。
            </div>
          )}
        </div>

        <aside className="people-detail">
          {selectedPerson ? (
            <>
              <div className="people-detail__head">
                <div>
                  <div className="people-detail__eyebrow">個人檢視</div>
                  <div className="people-detail__name">{selectedPerson.name || '未命名人員'}</div>
                  <div className="people-detail__meta">
                    {selectedPerson.g === 'M' ? '弟兄' : '姊妹'} · {selectedPerson.appt || '—'}
                  </div>
                </div>
              </div>

              <div className="people-detail__form">
                <label className="field">
                  <span className="field__label">姓名</span>
                  <input
                    className="field__input"
                    value={localName}
                    onChange={(e) => setLocalName(e.target.value)}
                    onBlur={() => {
                      if (localName !== selectedPerson.name) updateSelected({ name: localName });
                    }}
                    placeholder="輸入中文姓名"
                  />
                </label>

                <label className="field">
                  <span className="field__label">LINE ID</span>
                  <input
                    className="field__input field__input--mono"
                    defaultValue={selectedPerson.lineUserId ?? ''}
                    key={selectedPerson.id}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val !== (selectedPerson.lineUserId ?? '')) updateSelected({ lineUserId: val });
                    }}
                    placeholder="U…（選填，用於推播通知）"
                  />
                </label>

                <div className="field">
                  <span className="field__label">性別</span>
                  <div className="chips">
                    <button
                      className="chip"
                      aria-pressed={selectedPerson.g === 'M' ? 'true' : 'false'}
                      onClick={() => setGender('M')}
                    >
                      弟兄
                    </button>
                    <button
                      className="chip"
                      aria-pressed={selectedPerson.g === 'F' ? 'true' : 'false'}
                      onClick={() => setGender('F')}
                    >
                      姊妹
                    </button>
                  </div>
                </div>

                <label className="field">
                  <span className="field__label">職務</span>
                  <select
                    className="field__input field__select"
                    value={selectedPerson.appt || DEFAULT_OFFICE}
                    onChange={(e) => updateSelected({ appt: e.target.value })}
                  >
                    {OFFICE_OPTIONS[selectedPerson.g ?? 'M'].map((office) => (
                      <option key={office} value={office}>{office}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="people-detail__section">
                <div className="people-detail__section-head">
                  <span>資格</span>
                  <small>點選切換</small>
                </div>
                <div className="chips people-quals">
                  {QUAL_OPTIONS.map((qual) => (
                    <button
                      key={qual}
                      className="chip"
                      aria-pressed={selectedPerson.quals.includes(qual) ? 'true' : 'false'}
                      onClick={() => toggleQualification(qual)}
                    >
                      {qual}
                    </button>
                  ))}
                </div>
              </div>

              <div className="people-detail__section">
                <div className="people-detail__section-head">
                  <span>近期指派</span>
                  <small>手動維護的最近服務紀錄</small>
                </div>
                <div className="timeline">
                  {(selectedPerson.recent?.length ? selectedPerson.recent : [{ date: '—', role: '尚未補上', note: '可先編輯人員資料補齊。' }]).map((item, index) => (
                    <div key={`${item.date}-${index}`} className="timeline__row">
                      <span className="timeline__date">{item.date}</span>
                      <span className="timeline__main">
                        <b>{item.role}</b>
                        <small>{item.note}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="people-detail__section">
                <div className="people-detail__section-head">
                  <span>未來安排</span>
                  <small>從本地節目資料自動整理</small>
                </div>
                <div className="timeline">
                  {upcoming.length ? upcoming.map((item, index) => (
                    <div key={`${item.date}-${item.label}-${index}`} className="timeline__row">
                      <span className="timeline__date">{item.date}</span>
                      <span className="timeline__main">
                        <b>{item.label}</b>
                        <small>{item.context}</small>
                      </span>
                    </div>
                  )) : (
                    <div className="people-empty people-empty--compact">目前沒有排定的未來項目。</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="people-empty">
              選擇一位人員來查看與編輯資料。
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
