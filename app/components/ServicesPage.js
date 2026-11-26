'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from './literature/PubThumb';
import HeaderMenu from './HeaderMenu';
import PrintStage from './PrintStage';
import ServicesPrintSheet from './ServicesPrint';
import FieldView from './services/FieldView';
import { serviceExportFilename } from '../lib/services.mjs';
import { downloadNodeImage, exportCapturesPdf } from '../lib/printPdf';

const monthOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const shiftMonth = (month, delta) => {
  const [year, part] = month.split('-').map(Number);
  return monthOf(new Date(year, part - 1 + delta, 1));
};
const dateLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d} ${'日一二三四五六'[new Date(y, m - 1, d).getDay()]}`;
};
const today = () => {
  const d = new Date();
  return `${monthOf(d)}-${String(d.getDate()).padStart(2, '0')}`;
};

export function PersonPicker({ people, select, recentIds = [] }) {
  const [query, setQuery] = useState('');
  const filtered = people
    .filter((person) => person.status !== 'inactive' && person.name.includes(query.trim()))
    .slice()
    .sort((a, b) => (a.g === 'M' ? 0 : 1) - (b.g === 'M' ? 0 : 1));
  const recent = recentIds
    .map((id) => filtered.find((person) => String(person.id) === String(id)))
    .filter(Boolean);
  const remaining = filtered.filter((person) => !recent.some((item) => item.id === person.id));
  const groups = [...new Set(remaining.map((person) => person.serviceGroup || '未分組'))].sort();
  function rows(items) {
    return items.map((person) => (
      <button type="button" key={`person-${person.id}`} onClick={() => select(person)}>
        <span>{person.name}</span>
        <small>{person.serviceGroup ? `${person.serviceGroup}組` : '未分組'}</small>
      </button>
    ));
  }
  return (
    <>
      <input
        autoFocus
        className="field__input"
        aria-label="搜尋人員"
        placeholder="搜尋人員"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="service-person-list">
        {recent.length > 0 && (
          <>
            <div className="service-person-heading">最近</div>
            {rows(recent)}
          </>
        )}
        {groups.map((group) => (
          <div key={`group-${group}`}>
            <div className="service-person-heading">{group === '未分組' ? group : `${group}組`}</div>
            {rows(remaining.filter((person) => (person.serviceGroup || '未分組') === group))}
          </div>
        ))}
      </div>
    </>
  );
}

function Notes({ category, canEdit, request, update }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(category.notes || '');
  const [error, setError] = useState('');
  const textarea = useRef(null);
  useEffect(() => {
    if (textarea.current) {
      textarea.current.style.height = 'auto';
      textarea.current.style.height = `${textarea.current.scrollHeight}px`;
    }
  }, [editing, value]);
  async function save() {
    try {
      const data = await request(`/api/services/categories/${category.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ notes: value }),
      });
      update(data.category);
      setEditing(false);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <section className="service-notes">
      <div className="service-section-head">
        <strong>注意事項</strong>
        {canEdit && !editing && (
          <button className="service-link" onClick={() => setEditing(true)}>
            編輯
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea
            ref={textarea}
            className="field__input service-notes-input"
            rows="4"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="service-actions">
            <button
              className="btn"
              onClick={() => {
                setValue(category.notes || '');
                setEditing(false);
              }}
            >
              取消
            </button>
            <button className="btn btn--primary" onClick={save}>
              儲存
            </button>
          </div>
        </>
      ) : (
        <div className="service-note-lines">
          {(category.notes || '尚無注意事項').split('\n').map((line, index) => {
            const match = line.match(/^(\s*\d+[.、．)）]\s*)(.*)$/);
            return (
              <div key={`note-line-${index}`} className={match ? 'service-note-line' : undefined}>
                {match ? (
                  <>
                    <span>{match[1]}</span>
                    <span>{match[2]}</span>
                  </>
                ) : (
                  line || '\u00a0'
                )}
              </div>
            );
          })}
        </div>
      )}
      {error && (
        <p className="service-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

function SlotView({ category, data, canEdit, people, ownName, save }) {
  const [cell, setCell] = useState(null);
  const [text, setText] = useState('');
  const [flash, setFlash] = useState(null);
  const dates = [
    ...new Set([
      ...data.dates.map((d) => d.iso),
      ...data.assignments.filter((a) => a.categoryId === category.id).map((a) => a.date),
    ]),
  ].sort();
  const nextDate = data.dates
    .map((item) => item.iso)
    .filter((date) => date >= today())
    .sort()[0];
  const recentIds = [
    ...new Set(
      data.assignments
        .filter((item) => item.categoryId === category.id && item.personId)
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((item) => item.personId),
    ),
  ];
  function choose(value) {
    setFlash({ ...cell, key: Date.now() });
    save({ categoryId: category.id, date: cell.date, position: cell.position, ...value });
    setCell(null);
    setText('');
  }
  return (
    <>
      <div className="service-table-wrap">
        <table className="service-table">
          <thead>
            <tr>
              <th scope="col">日期</th>
              {category.positions.map((p) => (
                <th scope="col" key={`position-${p}`}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dates.map((date) => (
              <tr
                key={`row-${date}`}
                className={`${date === nextDate ? 'service-next' : ''} ${date < today() ? 'service-past' : ''}`}
              >
                <th scope="row">{dateLabel(date)}</th>
                {category.positions.map((position) => {
                  const a = data.assignments.find(
                    (item) =>
                      item.categoryId === category.id &&
                      item.date === date &&
                      item.position === position,
                  );
                  const label = a?.personName || a?.text;
                  const flashKey = flash?.date === date && flash?.position === position ? flash.key : 'idle';
                  const cellClass = [
                    'service-cell',
                    !label && 'service-cell--empty',
                    a?.text && !a?.personName && 'service-cell--text',
                    a?.personName && a.personName === ownName && 'service-cell--own',
                    flash?.date === date && flash?.position === position && 'service-cell--flash',
                  ]
                    .filter(Boolean)
                    .join(' ');
                  return (
                    <td key={`cell-${date}-${position}`}>
                      {canEdit ? (
                        <button
                          key={`cell-button-${date}-${position}-${flashKey}`}
                          className={cellClass}
                          aria-label={`${dateLabel(date)} ${position}：${label || '新增安排'}`}
                          onClick={() => setCell({ date, position })}
                        >
                          {label || '＋'}
                        </button>
                      ) : (
                        <span className={cellClass}>{label || '—'}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {!dates.length && <p className="service-empty">這個月沒有聚會日期。</p>}
      </div>
      {cell && (
        <Sheet
          title={`${dateLabel(cell.date).split(' ')[0]} ${category.name} · ${cell.position}`}
          close={() => setCell(null)}
        >
          <PersonPicker
            people={people}
            recentIds={recentIds}
            select={(p) => choose({ personId: p.id, personName: p.name, text: null })}
          />
          <label className="field">
            <span className="field__label">填寫文字…</span>
            <input
              className="field__input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="例如：分區大會"
            />
          </label>
          <div className="service-actions service-quiet-actions">
            <button className="btn btn--ghost" onClick={() => choose({ personId: null, text: null })}>
              清除
            </button>
            <button
              className="btn btn--primary"
              disabled={!text.trim()}
              onClick={() => choose({ personId: null, text: text.trim() })}
            >
              儲存文字
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function CleaningView({ category, data, year, canEdit, people, save }) {
  const [selected, setSelected] = useState(null);
  const [groups, setGroups] = useState([]);
  const options = [
    ...new Set(['A', 'B', 'C', 'D', 'E', ...people.map((p) => p.serviceGroup).filter(Boolean)]),
  ];
  function open(month, value) {
    setSelected(month);
    setGroups(
      value
        ? value
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean)
        : [],
    );
  }
  function commit(clear = false) {
    save({
      categoryId: category.id,
      date: `${selected}-01`,
      position: '小組',
      personId: null,
      text: clear || !groups.length ? null : groups.join(','),
    });
    setSelected(null);
  }
  return (
    <>
      <div className="service-month-grid">
        {data.months.map(({ month, assignments }, index) => {
          const value = assignments.find((a) => a.categoryId === category.id)?.text;
          const current = month === monthOf(new Date());
          const cardClass = `service-month-card ${current ? 'is-current' : ''} ${month < monthOf(new Date()) ? 'is-past' : ''}`;
          const content = (
            <>
              <span className="service-month-label">
                {index + 1}月 {current && <small>本月</small>}
              </span>
              {value ? (
                <strong>{value.split(',').join('＋')}</strong>
              ) : (
                <span className="service-month-empty">未安排</span>
              )}
            </>
          );
          return canEdit ? (
            <button key={`month-${month}`} className={cardClass} onClick={() => open(month, value)}>
              {content}
            </button>
          ) : (
            <div key={`month-${month}`} className={cardClass}>
              {content}
            </div>
          );
        })}
      </div>
      {selected && (
        <Sheet title={`${year}年${Number(selected.slice(5))}月打掃`} close={() => setSelected(null)}>
          <p>選擇最多 3 個小組</p>
          <div className="service-group-chips">
            {options.map((group) => (
              <button
                key={`group-${group}`}
                className="chip"
                aria-pressed={groups.includes(group)}
                disabled={!groups.includes(group) && groups.length >= 3}
                onClick={() =>
                  setGroups(
                    groups.includes(group) ? groups.filter((g) => g !== group) : [...groups, group],
                  )
                }
              >
                {group}
              </button>
            ))}
          </div>
          <div className="service-actions">
            <button className="btn" onClick={() => commit(true)}>
              清除
            </button>
            <button className="btn btn--primary" onClick={() => commit()}>
              儲存
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function AddCategory({ close, request, added }) {
  const [name, setName] = useState('');
  const [positions, setPositions] = useState('');
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault();
    try {
      const result = await request('/api/services', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          kind: 'slots',
          positions: positions
            .split(/[,，]/)
            .map((p) => p.trim())
            .filter(Boolean),
        }),
      });
      added(result.category);
      close();
    } catch (err) {
      setError(err.message);
    }
  }
  return (
    <Sheet title="新增服務" close={close}>
      <form onSubmit={submit} className="service-form">
        <label className="field">
          <span className="field__label">名稱</span>
          <input
            required
            className="field__input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">職位（以逗號分隔）</span>
          <input
            required
            className="field__input"
            value={positions}
            onChange={(e) => setPositions(e.target.value)}
          />
        </label>
        {error && (
          <p className="service-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn--primary">新增</button>
      </form>
    </Sheet>
  );
}

export default function ServicesPage({ firebaseUser, canEdit, people = [] }) {
  const [categories, setCategories] = useState([]);
  const [selected, setSelected] = useState(null);
  const [month, setMonth] = useState(() => monthOf(new Date()));
  const [loaded, setLoaded] = useState(null);
  // The month payload for the 匯出 sheet: every category of the shown month in
  // one response (dates, slot assignments, 打掃 groups, 帶頭傳道 meetings). It is
  // kept apart from `loaded` because the live view only ever holds the selected
  // category's data, and the groups tab loads a whole year instead of a month.
  const [exportJob, setExportJob] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [error, setError] = useState('');
  const [add, setAdd] = useState(false);
  const [revision, setRevision] = useState(0);
  const [fieldAdd, setFieldAdd] = useState(0);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const tabsRef = useRef(null);
  const exportNodesRef = useRef([]);
  function updateOverflow() {
    const node = tabsRef.current;
    if (node)
      setOverflow({
        left: node.scrollLeft > 1,
        right: node.scrollLeft + node.clientWidth < node.scrollWidth - 1,
      });
  }
  useEffect(() => {
    const node = tabsRef.current;
    if (!node) return;
    const activeTab = node.querySelector('[aria-pressed="true"]');
    if (activeTab) {
      const stripRect = node.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      node.scrollLeft += tabRect.left - stripRect.left + (tabRect.width - stripRect.width) / 2;
    }
    updateOverflow();
    const observer = new ResizeObserver(updateOverflow);
    observer.observe(node);
    return () => observer.disconnect();
  }, [selected, categories]);
  const request = useCallback(
    async (path, init = {}) => {
      const token = await firebaseUser.getIdToken();
      const response = await fetch(path, {
        ...init,
        headers: {
          ...(init.body && !(init.body instanceof Blob) && !(init.body instanceof FormData)
            ? { 'Content-Type': 'application/json' }
            : {}),
          ...init.headers,
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || '操作失敗，請重試');
      return result;
    },
    [firebaseUser],
  );
  useEffect(() => {
    let live = true;
    request('/api/services')
      .then((result) => {
        if (!live) return;
        const active = result.categories.filter((c) => c.active);
        setCategories(active);
        let saved;
        try {
          saved = localStorage.getItem('services-tab');
        } catch {}
        setSelected(active.find((c) => c.key === saved)?.id || active[0]?.id);
      })
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [request]);
  const category = categories.find((c) => c.id === selected);
  const year = month.slice(0, 4);
  const dataKey = category?.kind === 'groups' ? `groups:${year}` : `month:${month}`;
  const data = loaded?.key === dataKey ? loaded.result : null;
  function setData(result) {
    setLoaded({ key: dataKey, result });
  }
  useEffect(() => {
    if (!category) return;
    let live = true;
    setLoaded(null);
    setError('');
    const path =
      category.kind === 'groups'
        ? `/api/services/cleaning?year=${year}`
        : `/api/services/month?month=${month}`;
    request(path)
      .then((result) => live && setLoaded({ key: dataKey, result }))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [category, month, year, dataKey, request, revision]);
  function select(c) {
    setSelected(c.id);
    try {
      localStorage.setItem('services-tab', c.key);
    } catch {}
  }
  async function saveAssignment(value) {
    const previous = data;
    const { personName, ...payload } = value;
    const item = { ...payload, personName };
    if (category.kind === 'groups')
      setData({
        ...data,
        months: data.months.map((m) =>
          m.month === value.date.slice(0, 7)
            ? {
                ...m,
                assignments: [
                  ...m.assignments.filter((a) => a.categoryId !== value.categoryId),
                  ...(value.text ? [item] : []),
                ],
              }
            : m,
        ),
      });
    else
      setData({
        ...data,
        assignments: [
          ...data.assignments.filter(
            (a) =>
              !(
                a.categoryId === value.categoryId &&
                a.date === value.date &&
                a.position === value.position
              ),
          ),
          ...(value.personId || value.text ? [item] : []),
        ],
      });
    try {
      await request('/api/services/assignments', { method: 'PUT', body: JSON.stringify(payload) });
      setError('');
    } catch (e) {
      setData(previous);
      setError(`儲存失敗：${e.message}`);
    }
  }
  async function copyMonth() {
    try {
      await request('/api/services/field/copy-month', {
        method: 'POST',
        body: JSON.stringify({ from: shiftMonth(month, -1), to: month }),
      });
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e.message);
    }
  }
  // 匯出 always starts from a fresh /api/services/month payload: the live view
  // holds one category (or a whole year for 打掃), and the sheet must contain
  // every active category of the shown month. The payload is parked in
  // `exportJob` so the PrintStage can render it; a second effect does the
  // capture after that render (the stage hands over its nodes on mount).
  async function startExport(format) {
    if (exporting) return;
    setExporting(true);
    setExportError('');
    try {
      const payload = await request(`/api/services/month?month=${month}`);
      setExportJob({ month, format, data: payload });
    } catch (e) {
      setExportError(e.message);
      setExporting(false);
    }
  }
  useEffect(() => {
    if (!exportJob) return undefined;
    let live = true;
    (async () => {
      try {
        await document.fonts?.ready;
        const nodes = exportNodesRef.current.filter(Boolean);
        if (exportJob.format === 'pdf') {
          await exportCapturesPdf(nodes, {
            filename: serviceExportFilename(exportJob.month, 'pdf'),
            perPage: 1,
          });
        } else {
          if (!nodes[0]) throw new Error('沒有可匯出的內容。');
          await downloadNodeImage(nodes[0], serviceExportFilename(exportJob.month, 'jpg'), { background: '#ffffff' });
        }
      } catch (e) {
        if (live) setExportError(e.message || '匯出失敗');
      } finally {
        if (live) {
          setExportJob(null);
          setExporting(false);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [exportJob]);
  return (
    <section className="services-page wide-grid">
      <div className="service-tabs-sticky">
        <div
          className={`service-tabs-mask ${overflow.left ? 'fade-left' : ''} ${overflow.right ? 'fade-right' : ''}`}
        >
          <div
            ref={tabsRef}
            onScroll={updateOverflow}
            className="lit-segment service-tabs"
            aria-label="服務類別"
          >
            {categories.map((c) => (
              <button key={`tab-${c.id}`} aria-pressed={c.id === selected} onClick={() => select(c)}>
                {c.name}
              </button>
            ))}
            {canEdit && (
              <button className="service-add-tab" aria-label="新增服務類別" onClick={() => setAdd(true)}>
                ＋
              </button>
            )}
          </div>
        </div>
        <span className={`service-tabs-cue${overflow.right ? ' is-on' : ''}`} aria-hidden="true">›</span>
      </div>
      {category && (
        <>
          <div className="service-toolbar page-bar">
            <div className="service-switcher">
              <button
                aria-label={category.kind === 'groups' ? '上一年' : '上個月'}
                onClick={() => setMonth(shiftMonth(month, category.kind === 'groups' ? -12 : -1))}
              >
                ‹
              </button>
              <strong>
                {category.kind === 'groups' ? year : `${year}年${Number(month.slice(5))}月`}
              </strong>
              <button
                aria-label={category.kind === 'groups' ? '下一年' : '下個月'}
                onClick={() => setMonth(shiftMonth(month, category.kind === 'groups' ? 12 : 1))}
              >
                ›
              </button>
            </div>
            <div className="service-header-actions page-bar__actions">
              {category.kind === 'field' && canEdit && (
                <button
                  className="btn btn--primary service-add-button"
                  onClick={() => setFieldAdd((n) => n + 1)}
                >
                  ＋ 新增
                </button>
              )}
              {/* The sheet always covers the month's whole schedule, whatever tab
                  is open, so 匯出 is offered on every category. The field-only
                  copy action shares this one overflow menu on phones. */}
              <HeaderMenu label="匯出" disabled={exporting}>
                {category.kind === 'field' && canEdit && (
                  <button type="button" role="menuitem" className="menu__item" onClick={copyMonth}>
                    複製上個月的時段
                  </button>
                )}
                <button type="button" role="menuitem" className="menu__item" onClick={() => startExport('pdf')}>
                  <span className="menu__ic">▤</span>下載 PDF
                </button>
                <button type="button" role="menuitem" className="menu__item" onClick={() => startExport('jpg')}>
                  <span className="menu__ic">▣</span>匯出 JPG
                </button>
              </HeaderMenu>
            </div>
          </div>
          {exportError && (
            <div className="service-error" role="alert">
              匯出失敗：{exportError}
            </div>
          )}
          {error && (
            <div className="service-error" role="alert">
              {error}{' '}
              <button className="service-link" onClick={() => setRevision((n) => n + 1)}>
                重試
              </button>
            </div>
          )}
          {!data && !error && <p>載入中…</p>}
          {data && (
            <div className="service-content" key={`body-${category.id}:${dataKey}`}>
              {category.kind === 'slots' && (
                <SlotView
                  category={category}
                  data={data}
                  canEdit={canEdit}
                  people={people}
                  ownName={firebaseUser.displayName}
                  save={saveAssignment}
                />
              )}
              {category.kind === 'groups' && (
                <CleaningView
                  category={category}
                  data={data}
                  year={year}
                  canEdit={canEdit}
                  people={people}
                  save={saveAssignment}
                />
              )}
              {category.kind === 'field' && (
                <FieldView
                  data={data}
                  month={month}
                  canEdit={canEdit}
                  people={people}
                  request={request}
                  reload={() => setRevision((n) => n + 1)}
                  addSignal={fieldAdd}
                  consumeAdd={() => setFieldAdd(0)}
                />
              )}
            </div>
          )}
          {category.kind !== 'field' && (
            <Notes
              key={`notes-${category.id}`}
              category={category}
              canEdit={canEdit}
              request={request}
              update={(updated) =>
                setCategories(categories.map((c) => (c.id === updated.id ? updated : c)))
              }
            />
          )}
        </>
      )}
      <p className="service-hint">這些服務會自動出現在你的行事曆訂閱。</p>
      {/* The 匯出 sheet: one white page holding every category of the shown
          month, read-only. It renders while `exportJob` is set and is captured
          right after that render; `exporting` keeps the button disabled. */}
      {exportJob && (
        <PrintStage nodesRef={exportNodesRef} className="print-stage--services">
          <ServicesPrintSheet
            month={exportJob.month}
            categories={categories}
            monthData={exportJob.data}
          />
        </PrintStage>
      )}
      {add && (
        <AddCategory
          close={() => setAdd(false)}
          request={request}
          added={(c) => {
            setCategories([...categories, c]);
            select(c);
          }}
        />
      )}
    </section>
  );
}
