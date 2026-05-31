'use client';
import { useMemo, useState } from 'react';
import { midweekWeeks, peopleData, weekendData } from '../data/index';

const STATUS_FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'active', label: '可排定' },
  { id: 'away', label: '外出' },
];

const QUAL_OPTIONS = [
  '主席',
  '禱告',
  '寶藏演講',
  '經文寶石',
  '朗讀',
  '傳道示範',
  '助手',
  '生活演講',
  '研經班主持',
  '守望台主持',
  '公眾演講',
];

const OFFICE_OPTIONS = {
  M: ['長老', '助理僕人', '傳道員', '未受浸傳道員'],
  F: ['傳道員', '未受浸傳道員'],
};

const DEFAULT_OFFICE = '傳道員';

function clonePeople() {
  return peopleData.map((person, index) => ({
    ...person,
    id: `person-${index + 1}`,
    appt: person.appt && person.appt !== '—' ? person.appt : DEFAULT_OFFICE,
    recent: person.recent ?? [],
  }));
}

function collectUpcomingAssignments(name) {
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

  weekendData.forEach((row) => {
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
    id: `person-${nextId}`,
    name: '',
    g: 'M',
    appt: DEFAULT_OFFICE,
    quals: [],
    status: 'active',
    awayNote: '',
    recent: [],
  };
}

export default function PeoplePage() {
  const [people, setPeople] = useState(() => clonePeople());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(() => `person-1`);
  const [nextId, setNextId] = useState(peopleData.length + 1);

  const filteredPeople = useMemo(() => {
    return people.filter((person) => {
      if (filter !== 'all' && person.status !== filter) return false;
      if (query && !person.name.includes(query)) return false;
      return true;
    });
  }, [people, query, filter]);

  const selectedPerson = people.find((person) => person.id === selectedId) ?? filteredPeople[0] ?? people[0];

  const totals = useMemo(() => {
    const activeCount = people.filter((person) => person.status !== 'away').length;
    return {
      total: people.length,
      active: activeCount,
      away: people.length - activeCount,
    };
  }, [people]);

  const upcoming = useMemo(() => {
    if (!selectedPerson?.name) return [];
    return collectUpcomingAssignments(selectedPerson.name);
  }, [selectedPerson]);

  function updateSelected(changes) {
    if (!selectedPerson) return;
    setPeople((prev) => prev.map((person) => (person.id === selectedPerson.id ? { ...person, ...changes } : person)));
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

  function addPerson() {
    const fresh = createBlankPerson(nextId);
    setPeople((prev) => [fresh, ...prev]);
    setSelectedId(fresh.id);
    setNextId((value) => value + 1);
    setFilter('all');
    setQuery('');
  }

  return (
    <section>
      <div className="people-header">
        <div>
          <div className="toolbar">
            <span className="toolbar__title">人員 · 共 {totals.total} 位</span>
          </div>
          <div className="people-kpis" aria-label="人員統計">
            <div className="people-kpi">
              <span className="people-kpi__label">總人數</span>
              <span className="people-kpi__value">{totals.total}</span>
            </div>
            <div className="people-kpi">
              <span className="people-kpi__label">可排定</span>
              <span className="people-kpi__value">{totals.active}</span>
            </div>
            <div className="people-kpi people-kpi--alert">
              <span className="people-kpi__label">外出</span>
              <span className="people-kpi__value">{totals.away}</span>
            </div>
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

      <div className="chips people-filters" role="group" aria-label="人員篩選">
        {STATUS_FILTERS.map((item) => (
          <button
            key={item.id}
            className="chip"
            aria-pressed={filter === item.id ? 'true' : 'false'}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="people-subtitle">
        {query ? (
          <span>搜尋「{query}」· 找到 {filteredPeople.length} 位</span>
        ) : (
          <span>以名單為核心的卡片檢視，適合快速查看資格、外出狀態與個人負載。</span>
        )}
      </div>

      <div className="people-layout">
        <div className="people-list">
          {filteredPeople.length > 0 ? filteredPeople.map((person) => (
            <button
              key={person.id}
              className={`person${person.status === 'away' ? ' is-away' : ''}${selectedPerson?.id === person.id ? ' is-selected' : ''}`}
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
                {person.status === 'away' && (
                  <div className="away-flag">● {person.awayNote || '外出中'}</div>
                )}
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
                <div className={`people-detail__status people-detail__status--${selectedPerson.status}`}>
                  {selectedPerson.status === 'away' ? '外出' : '可排定'}
                </div>
              </div>

              <div className="people-detail__stats">
                <div className="people-stat">
                  <span className="people-stat__label">未來指派</span>
                  <span className="people-stat__value">{upcoming.length}</span>
                </div>
                <div className="people-stat">
                  <span className="people-stat__label">近期記錄</span>
                  <span className="people-stat__value">{selectedPerson.recent?.length ?? 0}</span>
                </div>
                <div className="people-stat">
                  <span className="people-stat__label">資格數</span>
                  <span className="people-stat__value">{selectedPerson.quals.length}</span>
                </div>
              </div>

              <div className="people-detail__form">
                <label className="field">
                  <span className="field__label">姓名</span>
                  <input
                    className="field__input"
                    value={selectedPerson.name}
                    onChange={(e) => updateSelected({ name: e.target.value })}
                    placeholder="輸入中文姓名"
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

                <div className="field">
                  <span className="field__label">狀態</span>
                  <div className="chips">
                    <button
                      className="chip"
                      aria-pressed={selectedPerson.status === 'active' ? 'true' : 'false'}
                      onClick={() => updateSelected({ status: 'active' })}
                    >
                      可排定
                    </button>
                    <button
                      className="chip chip--alert"
                      aria-pressed={selectedPerson.status === 'away' ? 'true' : 'false'}
                      onClick={() => updateSelected({ status: 'away' })}
                    >
                      外出
                    </button>
                  </div>
                </div>

                <label className="field">
                  <span className="field__label">外出說明</span>
                  <input
                    className="field__input"
                    value={selectedPerson.awayNote || ''}
                    onChange={(e) => updateSelected({ awayNote: e.target.value })}
                    placeholder="例如：6/14 - 6/28 外出"
                  />
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
