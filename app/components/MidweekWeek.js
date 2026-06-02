'use client';
import { useEffect, useState } from 'react';

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

function PairSlot({ baseId, catKey, ctxLabel, defaultNames, roleLabels, getAssign, openSheet, getSuggestion, onAccept, onClear }) {
  const [label0, label1] = roleLabels ?? ['', '助手'];
  const ghostProps = { getSuggestion, onAccept, onClear };
  return (
    <span className="who--pair">
      <WhoSlot
        slotId={`${baseId}_0`}
        catKey={catKey}
        ctxLabel={label0 ? `${ctxLabel} (${label0})` : ctxLabel}
        defaultName={defaultNames[0] ?? ''}
        getAssign={getAssign}
        openSheet={openSheet}
        {...ghostProps}
      />
      <span className="who-sep">/</span>
      <WhoSlot
        slotId={`${baseId}_1`}
        catKey={catKey}
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
      <span className="row__part">
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
            {shownPart.title} <span className="dur">（{shownPart.dur}）</span>
            {shownPart.cbsRef && <span className="cbs-ref">{shownPart.cbsRef}</span>}
          </>
        )}
      </span>
      <span className="row__assign">
        {shownPart.roleLabel && <span className="role-label">{shownPart.roleLabel}</span>}
        {isPair ? (
          <PairSlot
            baseId={`${weekId}_${part.id}`}
            catKey={shownPart.cat}
            ctxLabel={`${ctx} · ${shownPart.title}`}
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
            catKey={shownPart.cat}
            ctxLabel={`${ctx} · ${shownPart.title}`}
            defaultName={shownPart.assign[0] ?? ''}
            getAssign={getAssign}
            openSheet={openSheet}
            getSuggestion={getSuggestion}
            onAccept={onAccept}
            onClear={onClear}
          />
        )}
        {editMode && isPairRole && (
          <button
            className="pair-toggle-btn"
            title={helperHidden ? `加入${roleLabels?.[1] ?? '助手'}欄位` : `移除${roleLabels?.[1] ?? '助手'}欄位`}
            onClick={() => {
              if (!helperHidden) clearSlot?.(`${weekId}_${part.id}_1`);
              onToggleHelper?.(!helperHidden);
            }}
          >{helperHidden ? '＋' : '−'}</button>
        )}
      </span>
    </div>
  );
}

export default function MidweekWeek({ week, editMode, getAssign, openSheet, updateMidweekWeek, cardRef, getSuggestion, onAccept, onClear, clearSlot }) {
  const wId = `mw${week.id}`;
  const ctx = week.date;
  const [draftWeek, setDraftWeek] = useState(week);
  const [hiddenHelpers, setHiddenHelpers] = useState(new Set());

  const toggleHelper = (partId, hide) => setHiddenHelpers(prev => {
    const next = new Set(prev);
    if (hide) next.add(partId); else next.delete(partId);
    return next;
  });

  useEffect(() => {
    setDraftWeek(week);
  }, [week]);

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

  return (
    <article className="card" ref={cardRef}>
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
        {shownWeek.treasures.map((part) => (
          <PartRow
            key={part.id}
            weekId={wId}
            ctx={ctx}
            sectionName="treasures"
            part={part}
            editMode={editMode}
            draftPart={editMode ? shownWeek.treasures.find((p) => p.id === part.id) : null}
            onDraftPartChange={(patch) => updateDraftPart('treasures', part.id, patch)}
            updateMidweekWeek={updateMidweekWeek}
            getAssign={getAssign}
            openSheet={openSheet}
            getSuggestion={getSuggestion}
            onAccept={onAccept}
            onClear={onClear}
            helperHidden={hiddenHelpers.has(part.id)}
            onToggleHelper={(hide) => toggleHelper(part.id, hide)}
            clearSlot={clearSlot}
          />
        ))}
      </div>

        <div className="band band--ministry">
        <span className="band__title">用心準備傳道工作</span>
      </div>
      <div className="rows">
        {shownWeek.ministry.map((part) => (
          <PartRow
            key={part.id}
            weekId={wId}
            ctx={ctx}
            sectionName="ministry"
            part={part}
            editMode={editMode}
            draftPart={editMode ? shownWeek.ministry.find((p) => p.id === part.id) : null}
            onDraftPartChange={(patch) => updateDraftPart('ministry', part.id, patch)}
            updateMidweekWeek={updateMidweekWeek}
            getAssign={getAssign}
            openSheet={openSheet}
            getSuggestion={getSuggestion}
            onAccept={onAccept}
            onClear={onClear}
            helperHidden={hiddenHelpers.has(part.id)}
            onToggleHelper={(hide) => toggleHelper(part.id, hide)}
            clearSlot={clearSlot}
          />
        ))}
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

        {shownWeek.living.map((part) => (
          <PartRow
            key={part.id}
            weekId={wId}
            ctx={ctx}
            sectionName="living"
            part={part}
            editMode={editMode}
            draftPart={editMode ? shownWeek.living.find((p) => p.id === part.id) : null}
            onDraftPartChange={(patch) => updateDraftPart('living', part.id, patch)}
            updateMidweekWeek={updateMidweekWeek}
            getAssign={getAssign}
            openSheet={openSheet}
            getSuggestion={getSuggestion}
            onAccept={onAccept}
            onClear={onClear}
            helperHidden={hiddenHelpers.has(part.id)}
            onToggleHelper={(hide) => toggleHelper(part.id, hide)}
            clearSlot={clearSlot}
          />
        ))}

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
    </article>
  );
}
