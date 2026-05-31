'use client';
import { useCallback } from 'react';

function WhoSlot({ slotId, catKey, ctxLabel, defaultName, editMode, getAssign, openSheet, onEdit }) {
  const name = getAssign(slotId, defaultName);
  const isEmpty = !name;

  if (editMode) {
    return (
      <span
        className={`who${isEmpty ? ' who--empty' : ''}`}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const v = e.currentTarget.textContent.trim();
          if (v !== (isEmpty ? '未指派' : name)) onEdit(slotId, v);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } }}
      >
        {name || '未指派'}
      </span>
    );
  }

  return (
    <span
      className={`who${isEmpty ? ' who--empty' : ''}`}
      onClick={() => openSheet(slotId, catKey, ctxLabel, name)}
    >
      {name || '未指派'}
    </span>
  );
}

function PairSlot({ baseId, catKey, ctxLabel, defaultNames, editMode, getAssign, openSheet, onEdit }) {
  const name0 = getAssign(`${baseId}_0`, defaultNames[0] ?? '');
  const name1 = getAssign(`${baseId}_1`, defaultNames[1] ?? '');
  return (
    <span className="who--pair">
      <WhoSlot slotId={`${baseId}_0`} catKey={catKey} ctxLabel={ctxLabel} defaultName={defaultNames[0] ?? ''}
        editMode={editMode} getAssign={getAssign} openSheet={openSheet} onEdit={onEdit} />
      <span className="who-sep">/</span>
      <WhoSlot slotId={`${baseId}_1`} catKey={catKey} ctxLabel={`${ctxLabel} (助手)`} defaultName={defaultNames[1] ?? ''}
        editMode={editMode} getAssign={getAssign} openSheet={openSheet} onEdit={onEdit} />
    </span>
  );
}

export default function MidweekWeek({ week, editMode, getAssign, openSheet, onEdit }) {
  const wId = `mw${week.id}`;
  const ctx = week.date;

  return (
    <article className="card">
      {/* Header */}
      <div className="mw-head">
        <div className="mw-head__date">{week.date}</div>
        <div className="mw-head__main">
          <div className="mw-head__sub">
            <span className="weekday-pill">{week.weekdayPill}</span>
            <span className="mw-head__reading">
              每週閱讀經文　<b>{week.reading}</b>
            </span>
          </div>
        </div>
        <div className="mw-head__roles">
          <span className="role-label">主席</span>
          <WhoSlot slotId={`${wId}_chairman`} catKey="chairman" ctxLabel={ctx}
            defaultName={week.chairman} editMode={editMode} getAssign={getAssign}
            openSheet={openSheet} onEdit={onEdit} />
          <span className="role-label">開始禱告</span>
          <WhoSlot slotId={`${wId}_openPrayer`} catKey="prayer" ctxLabel={ctx}
            defaultName={week.openPrayer} editMode={editMode} getAssign={getAssign}
            openSheet={openSheet} onEdit={onEdit} />
        </div>
      </div>

      {/* Opening song + intro rows */}
      <div className="rows">
        <div className="row row--song">
          <span className="row__time">7:30</span>
          <span className="dotwrap"><span className="dot dot--treasures" /></span>
          <span className="row__part">唱詩 {week.openSong} 首</span>
          <span className="row__assign" />
        </div>
        <div className="row">
          <span className="row__time">{week.openIntroTime}</span>
          <span className="dotwrap"><span className="dot dot--treasures" /></span>
          <span className="row__part">開場白 <span className="dur">（1 分鐘）</span></span>
          <span className="row__assign" />
        </div>
      </div>

      {/* Treasures section */}
      <div className="band band--treasures">
        <span className="band__title">上帝話語的寶藏</span>
        <span className="band__group">{week.treasuresGroup}</span>
      </div>
      <div className="rows">
        {week.treasures.map((part) => {
          const baseId = `${wId}_${part.id}`;
          const isPair = part.assign.length === 2;
          return (
            <div key={part.id} className="row">
              <span className="row__time">{part.time}</span>
              <span className="dotwrap">
                <span className="dot dot--treasures" />
                <span className="partnum">{part.partNum}</span>
              </span>
              <span className="row__part">
                {part.title} <span className="dur">（{part.dur}）</span>
              </span>
              <span className="row__assign">
                {part.roleLabel && <span className="role-label">{part.roleLabel}</span>}
                {isPair ? (
                  <PairSlot baseId={baseId} catKey={part.cat} ctxLabel={`${ctx} · ${part.title}`}
                    defaultNames={part.assign} editMode={editMode} getAssign={getAssign}
                    openSheet={openSheet} onEdit={onEdit} />
                ) : (
                  <WhoSlot slotId={`${baseId}_0`} catKey={part.cat} ctxLabel={`${ctx} · ${part.title}`}
                    defaultName={part.assign[0] ?? ''} editMode={editMode} getAssign={getAssign}
                    openSheet={openSheet} onEdit={onEdit} />
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Ministry section */}
      <div className="band band--ministry">
        <span className="band__title">用心準備傳道工作</span>
        <span className="band__group">{week.ministryGroup}</span>
      </div>
      <div className="rows">
        {week.ministry.map((part) => {
          const baseId = `${wId}_${part.id}`;
          const isPair = part.assign.length === 2;
          return (
            <div key={part.id} className="row">
              <span className="row__time">{part.time}</span>
              <span className="dotwrap">
                <span className="dot dot--ministry" />
                <span className="partnum">{part.partNum}</span>
              </span>
              <span className="row__part">
                {part.title} <span className="dur">（{part.dur}）</span>
              </span>
              <span className="row__assign">
                {part.roleLabel && <span className="role-label">{part.roleLabel}</span>}
                {isPair ? (
                  <PairSlot baseId={baseId} catKey={part.cat} ctxLabel={`${ctx} · ${part.title}`}
                    defaultNames={part.assign} editMode={editMode} getAssign={getAssign}
                    openSheet={openSheet} onEdit={onEdit} />
                ) : (
                  <WhoSlot slotId={`${baseId}_0`} catKey={part.cat} ctxLabel={`${ctx} · ${part.title}`}
                    defaultName={part.assign[0] ?? ''} editMode={editMode} getAssign={getAssign}
                    openSheet={openSheet} onEdit={onEdit} />
                )}
              </span>
            </div>
          );
        })}
      </div>

      {/* Living section */}
      <div className="band band--living">
        <span className="band__title">基督徒的生活</span>
        <span className="band__group" />
      </div>
      <div className="rows">
        {/* Mid-section song */}
        <div className="row row--song">
          <span className="row__time">{week.midSongTime}</span>
          <span className="dotwrap"><span className="dot dot--living" /></span>
          <span className="row__part">唱詩 {week.midSong} 首</span>
          <span className="row__assign" />
        </div>

        {week.living.map((part) => {
          const baseId = `${wId}_${part.id}`;
          const isCbs = part.id === 'cbs';
          return (
            <div key={part.id} className="row">
              <span className="row__time">{part.time}</span>
              <span className="dotwrap">
                <span className="dot dot--living" />
                <span className="partnum">{part.partNum}</span>
              </span>
              <span className="row__part">
                {part.title} <span className="dur">（{part.dur}）</span>
              </span>
              <span className="row__assign">
                {part.roleLabel && <span className="role-label">{part.roleLabel}</span>}
                {isCbs ? (
                  <PairSlot baseId={baseId} catKey="cbs" ctxLabel={`${ctx} · 會眾研經班主持`}
                    defaultNames={part.assign} editMode={editMode} getAssign={getAssign}
                    openSheet={openSheet} onEdit={onEdit} />
                ) : (
                  <WhoSlot slotId={`${baseId}_0`} catKey={part.cat} ctxLabel={`${ctx} · ${part.title}`}
                    defaultName={part.assign[0] ?? ''} editMode={editMode} getAssign={getAssign}
                    openSheet={openSheet} onEdit={onEdit} />
                )}
              </span>
            </div>
          );
        })}

        {/* Closing remarks */}
        <div className="row">
          <span className="row__time">{week.closingTime}</span>
          <span className="dotwrap"><span className="dot dot--living" /></span>
          <span className="row__part">結語 <span className="dur">（{week.closingDur}）</span></span>
          <span className="row__assign" />
        </div>

        {/* Closing song + prayer */}
        <div className="row row--song">
          <span className="row__time">{week.closeSongTime}</span>
          <span className="dotwrap"><span className="dot dot--living" /></span>
          <span className="row__part">唱詩 {week.closeSong} 首</span>
          <span className="row__assign">
            <span className="role-label">結束禱告</span>
            <WhoSlot slotId={`${wId}_closePrayer`} catKey="prayer" ctxLabel={ctx}
              defaultName={week.closePrayer} editMode={editMode} getAssign={getAssign}
              openSheet={openSheet} onEdit={onEdit} />
          </span>
        </div>
      </div>
    </article>
  );
}
