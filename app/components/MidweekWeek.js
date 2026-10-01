'use client';
import { Fragment, useEffect, useState } from 'react';
import { slotCat } from '../lib/partTypes.mjs';
import { isMidweekSuspended, suspendedNotice } from '../lib/weekType.mjs';

function parseDurationMinutes(value) {
  const match = String(value ?? '').match(/^\s*(\d+)\s*(?:分鐘|min)?\s*$/i);
  return match ? Number(match[1]) : null;
}

function addMinutesToTime(time, minutes) {
  const match = String(time ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !Number.isFinite(minutes)) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 1 || hour > 12 || minute > 59) return '';
  const total = hour * 60 + minute + minutes;
  const nextHour = (((Math.floor(total / 60) - 1) % 12) + 12) % 12 + 1;
  const nextMinute = ((total % 60) + 60) % 60;
  return `${nextHour}:${String(nextMinute).padStart(2, '0')}`;
}

function AddPartForm({ section, afterPart, followingParts, onCancel, onSubmit, busy }) {
  const [title, setTitle] = useState('');
  const [dur, setDur] = useState('');
  const [time, setTime] = useState(() => addMinutesToTime(afterPart.time, parseDurationMinutes(afterPart.dur)));
  const [cat, setCat] = useState(section === 'ministry' ? 'ministry' : section === 'living' ? 'living' : 'treasures');
  const [ministryRole, setMinistryRole] = useState('pair');

  const roleLabel = section === 'ministry'
    ? (cat === 'ministrytalk' ? '學生' : ministryRole === 'pair' ? '學生/助手' : '學生')
    : cat === 'reading' ? '學生' : null;
  const preview = [];
  let cursor = time ? addMinutesToTime(time, parseDurationMinutes(dur)) : '';
  for (const part of followingParts) {
    if (!cursor) break;
    preview.push(`${part.title} ${cursor}`);
    cursor = addMinutesToTime(cursor, parseDurationMinutes(part.dur));
  }
  if (section === 'living' && cursor) preview.push(`結語 ${cursor}`);

  function handleSubmit(event) {
    event.preventDefault();
    if (!title.trim() || !dur.trim() || busy) return;
    onSubmit({ section, afterPartKey: afterPart.id, title: title.trim(), dur: dur.trim(), time, cat, roleLabel });
  }

  return (
    <form className="mw-addpart" onSubmit={handleSubmit}>
      <div className="mw-addpart__heading">新增節目</div>
      <div className="mw-addpart__fields">
        <label>
          <span>時間</span>
          <input className="week-edit__input week-edit__input--time" value={time} onChange={(e) => setTime(e.target.value)} placeholder="8:26" aria-label="新增節目時間" />
        </label>
        <label className="mw-addpart__title">
          <span>節目名稱</span>
          <input autoFocus className="week-edit__input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="輸入節目名稱" aria-label="新增節目名稱" />
        </label>
        <label>
          <span>時長</span>
          <input className="week-edit__input week-edit__input--dur" value={dur} onChange={(e) => setDur(e.target.value)} placeholder="15 分鐘" aria-label="新增節目時長" />
        </label>
        {section === 'treasures' && (
          <label>
            <span>類型</span>
            <select className="week-edit__input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="新增節目類型">
              <option value="treasures">寶藏演講</option>
              <option value="gems">經文寶石</option>
              <option value="reading">經文朗讀</option>
            </select>
          </label>
        )}
        {section === 'ministry' && (
          <>
            <label>
              <span>類型</span>
              <select className="week-edit__input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="新增節目類型">
                <option value="ministry">傳道練習</option>
                <option value="ministrytalk">傳道演講</option>
              </select>
            </label>
            {cat === 'ministry' && (
              <label>
                <span>指派欄位</span>
                <select className="week-edit__input" value={ministryRole} onChange={(e) => setMinistryRole(e.target.value)} aria-label="傳道練習指派方式">
                  <option value="pair">學生＋助手</option>
                  <option value="single">學生</option>
                </select>
              </label>
            )}
          </>
        )}
      </div>
      {preview.length > 0 && <div className="mw-addpart__preview">本段時間預覽：{preview.join(' · ')}</div>}
      <div className="mw-addpart__actions">
        <button className="btn btn--sm" type="button" onClick={onCancel} disabled={busy}>取消</button>
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy || !title.trim() || !dur.trim()}>{busy ? '儲存中…' : '新增節目'}</button>
      </div>
    </form>
  );
}

function TextField({ editMode, value, onChange, className, inputClassName, ariaLabel, placeholder }) {
  if (editMode) {
    return (
      <input
        className={inputClassName}
        type="text"
        value={value ?? ''}
        aria-label={ariaLabel}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  return <span className={className}>{value}</span>;
}

function WhoSlot({ slotId, catKey, ctxLabel, defaultName, getAssign, openSheet, getSuggestion, onAccept, onClear }) {
  const name = getAssign(slotId, defaultName);
  const ghost = !name ? (getSuggestion?.(slotId) ?? null) : null;

  if (ghost) {
    return (
      <span className="who who--ghost">
        <span className="who__ghost-name">{ghost}</span>
        <button className="who__ghost-btn" title="接受" onClick={() => onAccept?.(slotId, ghost)}>✓</button>
        <button className="who__ghost-btn who__ghost-btn--clear" title="清除" onClick={() => onClear?.(slotId)}>✕</button>
      </span>
    );
  }

  return (
    <span
      className={`who${!name ? ' who--empty' : ''}`}
      onClick={() => openSheet(slotId, catKey, ctxLabel, name)}
    >
      {name || '未指派'}
    </span>
  );
}

function PairSlot({ baseId, catKeys, ctxLabel, defaultNames, roleLabels, getAssign, openSheet, getSuggestion, onAccept, onClear }) {
  const [label0, label1] = roleLabels ?? ['', '助手'];
  const ghostProps = { getSuggestion, onAccept, onClear };
  return (
    <span className="who--pair">
      <WhoSlot
        slotId={`${baseId}_0`}
        catKey={catKeys[0]}
        ctxLabel={label0 ? `${ctxLabel} (${label0})` : ctxLabel}
        defaultName={defaultNames[0] ?? ''}
        getAssign={getAssign}
        openSheet={openSheet}
        {...ghostProps}
      />
      <span className="who-sep">/</span>
      <WhoSlot
        slotId={`${baseId}_1`}
        catKey={catKeys[1]}
        ctxLabel={`${ctxLabel} (${label1})`}
        defaultName={defaultNames[1] ?? ''}
        getAssign={getAssign}
        openSheet={openSheet}
        {...ghostProps}
      />
    </span>
  );
}

function updateWeekSection(weekId, sectionName, partId, updateMidweekWeek, patch) {
  updateMidweekWeek(weekId, (week) => ({
    ...week,
    [sectionName]: week[sectionName].map((part) => (
      part.id === partId ? { ...part, ...patch } : part
    )),
  }));
}

function partContext(ctx, part, includeScenario) {
  const heading = `${ctx} · ${part.title}（${part.dur}）`;
  return includeScenario && part.scenario ? `${heading}　·　情境：${part.scenario}` : heading;
}

function PartRow({
  weekId,
  ctx,
  sectionName,
  part,
  editMode,
  draftPart,
  onDraftPartChange,
  updateMidweekWeek,
  getAssign,
  openSheet,
  getSuggestion,
  onAccept,
  onClear,
  helperHidden,
  onToggleHelper,
  clearSlot,
  onAddAfter,
}) {
  const shownPart = draftPart ?? part;
  const isPairRole = shownPart.roleLabel?.includes('/');
  const roleLabels = shownPart.roleLabel?.split('/');
  const isPair = isPairRole && !helperHidden;
  const updatePart = (patch) => updateWeekSection(weekId, sectionName, part.id, updateMidweekWeek, patch);

  return (
    <div className="row">
      <span className="row__time">
        <TextField
          editMode={editMode}
          value={shownPart.time}
          onChange={(value) => {
            onDraftPartChange({ time: value });
            updatePart({ time: value });
          }}
          className="row__time-value"
          inputClassName="week-edit__input week-edit__input--time"
          ariaLabel={`${shownPart.title} 時間`}
        />
      </span>
      <span className="dotwrap">
        <span className={`dot ${sectionName === 'ministry' ? 'dot--ministry' : sectionName === 'living' ? 'dot--living' : 'dot--treasures'}`} />
        <span className="partnum">{shownPart.partNum}</span>
      </span>
      <div className="row__part">
        {editMode ? (
          <span className="row__part-edit">
            <input
              className="week-edit__input week-edit__input--title"
              type="text"
              value={shownPart.title ?? ''}
              aria-label={`${shownPart.partNum} 題目`}
              onChange={(e) => {
                onDraftPartChange({ title: e.target.value });
                updatePart({ title: e.target.value });
              }}
            />
            <span className="row__dur">
              （
              <input
                className="week-edit__input week-edit__input--dur"
                type="text"
                value={shownPart.dur ?? ''}
                aria-label={`${shownPart.partNum} 時長`}
                onChange={(e) => {
                  onDraftPartChange({ dur: e.target.value });
                  updatePart({ dur: e.target.value });
                }}
              />
              ）
            </span>
          </span>
        ) : (
          <>
            <div className="row__part-main">
              {shownPart.title} <span className="dur">（{shownPart.dur}）</span>
              {shownPart.cbsRef && <span className="cbs-ref">{shownPart.cbsRef}</span>}
            </div>
          </>
        )}
        {sectionName === 'ministry' && shownPart.scenario && <div className="row__scenario">{shownPart.scenario}</div>}
      </div>
      <span className="row__assign">
        {shownPart.roleLabel && <span className="role-label">{shownPart.roleLabel}</span>}
        {isPair ? (
          <PairSlot
            baseId={`${weekId}_${part.id}`}
            catKeys={[slotCat(shownPart, '0'), slotCat(shownPart, '1')]}
            ctxLabel={partContext(ctx, shownPart, sectionName === 'ministry')}
            defaultNames={shownPart.assign}
            roleLabels={roleLabels}
            getAssign={getAssign}
            openSheet={openSheet}
            getSuggestion={getSuggestion}
            onAccept={onAccept}
            onClear={onClear}
          />
        ) : (
          <WhoSlot
            slotId={`${weekId}_${part.id}_0`}
            catKey={slotCat(shownPart, '0')}
            ctxLabel={partContext(ctx, shownPart, sectionName === 'ministry')}
            defaultName={shownPart.assign[0] ?? ''}
            getAssign={getAssign}
            openSheet={openSheet}
            getSuggestion={getSuggestion}
            onAccept={onAccept}
            onClear={onClear}
          />
        )}
        {editMode && (isPairRole || (sectionName === 'ministry' && shownPart.cat === 'ministry')) && (
          <button
            className="pair-toggle-btn"
            title={isPair ? `移除${roleLabels?.[1] ?? '助手'}欄位` : `加入${roleLabels?.[1] ?? '助手'}欄位`}
            onClick={() => {
              if (sectionName === 'ministry') {
                // The EPUB can't always tell pair vs single (e.g. mis-labelled talks),
                // so for ministry parts the toggle rewrites roleLabel itself — which
                // also flips the candidate pool (single 演講 → brothers-only).
                if (isPair) clearSlot?.(`${weekId}_${part.id}_1`);
                const patch = { roleLabel: isPair ? '學生' : '學生/助手' };
                onDraftPartChange(patch);
                updatePart(patch);
                if (helperHidden) onToggleHelper?.(false); // normalize legacy hideHelper
              } else {
                if (!helperHidden) clearSlot?.(`${weekId}_${part.id}_1`);
                onToggleHelper?.(!helperHidden);
              }
            }}
          >{isPair ? '−' : '＋'}</button>
        )}
        {editMode && (
          <button className="mw-addpart__trigger" type="button" title="在此後新增節目" aria-label={`在「${shownPart.title}」後新增節目`} onClick={onAddAfter}>＋節目</button>
        )}
      </span>
    </div>
  );
}

function initHiddenHelpers(week) {
  const allParts = [...(week.treasures ?? []), ...(week.ministry ?? []), ...(week.living ?? [])];
  return new Set(allParts.filter((p) => p.hideHelper).map((p) => p.id));
}

export default function MidweekWeek({ week, editMode, getAssign, openSheet, updateMidweekWeek, addMidweekPart, cardRef, getSuggestion, onAccept, onClear, clearSlot }) {
  const wId = `mw${week.id}`;
  const ctx = week.date;
  const [draftWeek, setDraftWeek] = useState(week);
  const [hiddenHelpers, setHiddenHelpers] = useState(() => initHiddenHelpers(week));
  const [addingAfter, setAddingAfter] = useState(null);
  const [addingBusy, setAddingBusy] = useState(false);

  useEffect(() => {
    if (!editMode) setAddingAfter(null);
  }, [editMode]);

  // Removing/adding a helper slot writes hideHelper into the shared week state.
  // It persists when edit mode is exited (saveMidweekWeek sends every part's hideHelper).
  const toggleHelper = (partId, hide) => {
    setHiddenHelpers(prev => {
      const next = new Set(prev);
      if (hide) next.add(partId); else next.delete(partId);
      return next;
    });
    const section = ['treasures', 'ministry', 'living'].find((s) =>
      week[s]?.some((p) => p.id === partId)
    );
    if (section) {
      updateMidweekWeek(week.id, (w) => ({
        ...w,
        [section]: w[section].map((p) => p.id === partId ? { ...p, hideHelper: hide } : p),
      }));
    }
  };

  useEffect(() => {
    setDraftWeek(week);
    setHiddenHelpers(initHiddenHelpers(week));
    setAddingAfter(null);
    setAddingBusy(false);
  }, [week.id]);

  const shownWeek = editMode ? draftWeek : week;
  const updateDraftWeek = (patch) => {
    setDraftWeek((current) => ({ ...current, ...patch }));
    updateMidweekWeek(week.id, (current) => ({ ...current, ...patch }));
  };
  const updateDraftPart = (sectionName, partId, patch) => {
    setDraftWeek((current) => ({
      ...current,
      [sectionName]: current[sectionName].map((part) => (
        part.id === partId ? { ...part, ...patch } : part
      )),
    }));
    updateWeekSection(week.id, sectionName, partId, updateMidweekWeek, patch);
  };

  const insertCreatedPart = (sectionName, afterPartKey, data) => {
    const apply = (current) => {
      const next = { ...current };
      const updates = new Map((data.updates ?? []).map((item) => [item.partKey, item]));
      for (const section of ['treasures', 'ministry', 'living']) {
        next[section] = (current[section] ?? []).map((part) => {
          const update = updates.get(part.id);
          return update ? { ...part, partNum: update.partNum, time: update.time } : part;
        });
      }
      const items = [...(next[sectionName] ?? [])];
      const index = items.findIndex((part) => part.id === afterPartKey);
      if (index < 0) return current;
      items.splice(index + 1, 0, data.part);
      next[sectionName] = items;
      if (data.closingTime !== undefined) next.closingTime = data.closingTime;
      if (data.closeSongTime !== undefined) next.closeSongTime = data.closeSongTime;
      return next;
    };

    setDraftWeek(apply);
    updateMidweekWeek(week.id, apply);
  };

  const submitNewPart = async (partDraft) => {
    setAddingBusy(true);
    try {
      const data = await addMidweekPart?.(shownWeek, partDraft);
      if (!data) return;
      insertCreatedPart(partDraft.section, partDraft.afterPartKey, data);
      setAddingAfter(null);
      openSheet?.(
        `${wId}_${data.part.id}_0`,
        slotCat(data.part, '0'),
        `${ctx} · ${data.part.title}`,
        data.part.assign?.[0] ?? '',
      );
    } finally {
      setAddingBusy(false);
    }
  };

  const renderParts = (sectionName) => (shownWeek[sectionName] ?? []).map((part) => {
    const formOpen = addingAfter?.section === sectionName && addingAfter.partKey === part.id;
    const followingParts = (shownWeek[sectionName] ?? []).filter((candidate) => candidate.partNum > part.partNum);
    return (
      <Fragment key={part.id}>
        <PartRow
          weekId={wId}
          ctx={ctx}
          sectionName={sectionName}
          part={part}
          editMode={editMode}
          draftPart={editMode ? shownWeek[sectionName].find((p) => p.id === part.id) : null}
          onDraftPartChange={(patch) => updateDraftPart(sectionName, part.id, patch)}
          updateMidweekWeek={updateMidweekWeek}
          getAssign={getAssign}
          openSheet={openSheet}
          getSuggestion={getSuggestion}
          onAccept={onAccept}
          onClear={onClear}
          helperHidden={hiddenHelpers.has(part.id)}
          onToggleHelper={(hide) => toggleHelper(part.id, hide)}
          clearSlot={clearSlot}
          onAddAfter={() => setAddingAfter({ section: sectionName, partKey: part.id })}
        />
        {editMode && formOpen && (
          <AddPartForm
            key={`${sectionName}:${part.id}`}
            section={sectionName}
            afterPart={part}
            followingParts={followingParts}
            busy={addingBusy}
            onCancel={() => setAddingAfter(null)}
            onSubmit={submitNewPart}
          />
        )}
      </Fragment>
    );
  });

  // type/label are edited via the navstrip (which writes to the parent week state),
  // so read them from `week` — draftWeek wouldn't see those edits live.
  const weekType = week.type ?? 'normal';
  const weekLabel = week.label ?? '';
  // 大會 / 暫停 weeks have no midweek meeting, so the card collapses to a notice
  // instead of listing a programme nobody will follow. 總覽 already renders these
  // weeks as a suspended row; this keeps the card, 總覽 and every export saying
  // the same thing — and the exports screenshot this card, so they cannot drift.
  const suspended = isMidweekSuspended(week);
  const cardClass = weekType === 'special' ? 'card card--special'
                  : suspended ? 'card card--assembly'
                  : 'card';

  // One thin strip, not a card with a header and a body: there is no programme
  // to show, and in the PDF grid this capture becomes the full-width notice band
  // between the real weeks. A tall slab there looked like a broken card.
  if (suspended) {
    return (
      <article className={`${cardClass} card--suspended`} ref={cardRef}>
        <div className="mw-susp">
          <TextField
            editMode={editMode}
            value={shownWeek.date}
            onChange={(value) => updateDraftWeek({ date: value })}
            className="mw-susp__date"
            inputClassName="week-edit__input week-edit__input--date"
            ariaLabel="聚會日期"
          />
          <span className="mw-susp__sep" aria-hidden="true" />
          <span className="mw-susp__text">{suspendedNotice(week)}</span>
        </div>
      </article>
    );
  }

  return (
    <article className={cardClass} ref={cardRef}>
      <div className="mw-head">
        <div className="mw-head__date">
          <TextField
            editMode={editMode}
            value={shownWeek.date}
            onChange={(value) => updateDraftWeek({ date: value })}
            className="mw-head__date-value"
            inputClassName="week-edit__input week-edit__input--date"
            ariaLabel="聚會日期"
          />
        </div>
        <div className="mw-head__main">
          <div className="mw-head__sub">
            <TextField
              editMode={editMode}
              value={shownWeek.weekdayPill}
              onChange={(value) => updateDraftWeek({ weekdayPill: value })}
              className="weekday-pill"
              inputClassName="week-edit__input week-edit__input--pill"
              ariaLabel="星期與時間"
            />
            {weekLabel && (
              <span className={`mw-type-badge mw-type-badge--${weekType}`}>{weekLabel}</span>
            )}
            <span className="mw-head__reading">
              每週閱讀經文　
              {editMode ? (
                <input
                  className="week-edit__input week-edit__input--reading"
                  type="text"
                  value={shownWeek.reading ?? ''}
                  aria-label="每週閱讀經文"
                  onChange={(e) => updateDraftWeek({ reading: e.target.value })}
                />
              ) : (
                <b>{shownWeek.reading}</b>
              )}
            </span>
          </div>
        </div>
        <div className="mw-head__roles">
          <span className="role-label">主席</span>
          <WhoSlot slotId={`${wId}_chairman`} catKey="chairman" ctxLabel={ctx} defaultName={shownWeek.chairman} getAssign={getAssign} openSheet={openSheet} getSuggestion={getSuggestion} onAccept={onAccept} onClear={onClear} />
          <span className="role-label">開始禱告</span>
          <WhoSlot slotId={`${wId}_openPrayer`} catKey="prayer" ctxLabel={ctx} defaultName={shownWeek.openPrayer} getAssign={getAssign} openSheet={openSheet} getSuggestion={getSuggestion} onAccept={onAccept} onClear={onClear} />
        </div>
      </div>

      <div className={weekType === 'assembly' ? 'mw-body mw-body--faint' : 'mw-body'}>
      <div className="rows">
        <div className="row row--song">
          <span className="row__time">7:30</span>
          <span className="dotwrap"><span className="dot dot--treasures" /></span>
          <span className="row__part">
            唱詩　
            {editMode ? (
              <input
                className="week-edit__input week-edit__input--song"
                type="text"
                value={shownWeek.openSong ?? ''}
                aria-label="開場唱詩首數"
                onChange={(e) => updateDraftWeek({ openSong: e.target.value })}
              />
            ) : (
              `${shownWeek.openSong} 首`
            )}
          </span>
          <span className="row__assign" />
        </div>
        <div className="row">
          <span className="row__time">
            <TextField
              editMode={editMode}
              value={shownWeek.openIntroTime}
              onChange={(value) => updateDraftWeek({ openIntroTime: value })}
              className="row__time-value"
              inputClassName="week-edit__input week-edit__input--time"
              ariaLabel="開場白時間"
            />
          </span>
          <span className="dotwrap"><span className="dot dot--treasures" /></span>
          <span className="row__part">
            開場白 <span className="dur">（1 分鐘）</span>
          </span>
          <span className="row__assign" />
        </div>
      </div>

        <div className="band band--treasures">
        <span className="band__title">上帝話語的寶藏</span>
      </div>
      <div className="rows">
        {renderParts('treasures')}
      </div>

        <div className="band band--ministry">
        <span className="band__title">用心準備傳道工作</span>
      </div>
      <div className="rows">
        {renderParts('ministry')}
      </div>

      <div className="band band--living">
        <span className="band__title">基督徒的生活</span>
      </div>
      <div className="rows">
        <div className="row row--song">
          <span className="row__time">
            <TextField
              editMode={editMode}
              value={shownWeek.midSongTime}
              onChange={(value) => updateDraftWeek({ midSongTime: value })}
              className="row__time-value"
              inputClassName="week-edit__input week-edit__input--time"
              ariaLabel="中場唱詩時間"
            />
          </span>
          <span className="dotwrap"><span className="dot dot--living" /></span>
          <span className="row__part">
            唱詩　
            {editMode ? (
              <input
                className="week-edit__input week-edit__input--song"
                type="text"
                value={shownWeek.midSong ?? ''}
                aria-label="中場唱詩首數"
                onChange={(e) => updateDraftWeek({ midSong: e.target.value })}
              />
            ) : (
              `${shownWeek.midSong} 首`
            )}
          </span>
          <span className="row__assign" />
        </div>

        {renderParts('living')}

        <div className="row">
          <span className="row__time">
            <TextField
              editMode={editMode}
              value={shownWeek.closingTime}
              onChange={(value) => updateDraftWeek({ closingTime: value })}
              className="row__time-value"
              inputClassName="week-edit__input week-edit__input--time"
              ariaLabel="結語時間"
            />
          </span>
          <span className="dotwrap"><span className="dot dot--living" /></span>
          <span className="row__part">
            結語　
            {editMode ? (
              <input
                className="week-edit__input week-edit__input--dur"
                type="text"
                value={shownWeek.closingDur ?? ''}
                aria-label="結語時長"
                onChange={(e) => updateDraftWeek({ closingDur: e.target.value })}
              />
            ) : (
              <span className="dur">（{shownWeek.closingDur}）</span>
            )}
          </span>
          <span className="row__assign" />
        </div>

        <div className="row row--song">
          <span className="row__time">
            <TextField
              editMode={editMode}
              value={shownWeek.closeSongTime}
              onChange={(value) => updateDraftWeek({ closeSongTime: value })}
              className="row__time-value"
              inputClassName="week-edit__input week-edit__input--time"
              ariaLabel="結束唱詩時間"
            />
          </span>
          <span className="dotwrap"><span className="dot dot--living" /></span>
          <span className="row__part">
            唱詩　
            {editMode ? (
              <input
                className="week-edit__input week-edit__input--song"
                type="text"
                value={shownWeek.closeSong ?? ''}
                aria-label="結束唱詩首數"
                onChange={(e) => updateDraftWeek({ closeSong: e.target.value })}
              />
            ) : (
              `${shownWeek.closeSong} 首`
            )}
          </span>
          <span className="row__assign">
            <span className="role-label">結束禱告</span>
            <WhoSlot
              slotId={`${wId}_closePrayer`}
              catKey="prayer"
              ctxLabel={ctx}
              defaultName={shownWeek.closePrayer}
              getAssign={getAssign}
              openSheet={openSheet}
              getSuggestion={getSuggestion}
              onAccept={onAccept}
              onClear={onClear}
            />
          </span>
        </div>
      </div>
      </div>{/* mw-body */}
    </article>
  );
}
