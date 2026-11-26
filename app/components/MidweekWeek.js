'use client';
import { Fragment, useEffect, useRef, useState } from 'react';
import Icon from './literature/Icon';
import { slotCat } from '../lib/partTypes.mjs';
import { isMidweekSuspended, suspendedNotice } from '../lib/weekType.mjs';
import { addMinutes, parseDuration, retimeClientWeek, timeDifference, timeSourceOptions, recomputeSectionTimes } from '../lib/midweekParts.mjs';

const SECTION_LABELS = {
  treasures: '上帝話語的寶藏',
  ministry: '用心準備傳道工作',
  living: '基督徒的生活',
};
const SECTIONS = ['treasures', 'ministry', 'living'];

const finePointer = () => typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;
function useFineFocus(ref) {
  useEffect(() => { if (finePointer()) requestAnimationFrame(() => ref.current?.focus()); }, []);
}

function partContext(ctx, part, includeScenario) {
  const heading = `${ctx} ・ ${part.title}（${part.dur}）`;
  return includeScenario && part.scenario ? `${heading}　・　情境：${part.scenario}` : heading;
}

function sectionEnd(parts) {
  const last = [...(parts ?? [])].sort((a, b) => a.partNum - b.partNum).at(-1);
  return last ? (addMinutes(last.time, parseDuration(last.dur)) ?? '') : '';
}

function WhoSlot({ slotId, catKey, ctxLabel, defaultName, getAssign, openSheet, getSuggestion, onAccept, onClear, slotOpts }) {
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
    <span className={`who${!name ? ' who--empty' : ''}`} onClick={() => openSheet(slotId, catKey, ctxLabel, name, slotOpts)}>
      {name || '未指派'}
    </span>
  );
}

function PairSlot({ baseId, catKeys, ctxLabel, defaultNames, roleLabels, getAssign, openSheet, getSuggestion, onAccept, onClear, secondOpts }) {
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
        slotOpts={secondOpts}
        {...ghostProps}
      />
    </span>
  );
}

function RowMain({ as, className, onClick, label, editKey, children }) {
  const Tag = as;
  const props = as === 'button'
    ? { type: 'button', onClick, 'aria-label': label, 'data-edit-key': editKey }
    : {};
  return <Tag className={`row__main${className ? ` ${className}` : ''}`} {...props}>{children}</Tag>;
}

function Assignees({ part, wId, ctx, sectionName, editMode, getAssign, openSheet, getSuggestion, onAccept, onClear, toggleHelperSlot }) {
  const isPairRole = Boolean(part.roleLabel?.includes('/'));
  const roleLabels = part.roleLabel?.split('/') ?? [];
  const isPair = isPairRole && !part.hideHelper;
  // Same condition the old ⋯ item used: ministry student parts and pair-role
  // parts (e.g. cbs) whose helper is hidden via hideHelper.
  const canTakeSecond = isPairRole || (sectionName === 'ministry' && part.cat === 'ministry');
  const helperLabel = sectionName === 'ministry' ? '助手' : (roleLabels[1] ?? '助手');
  const baseId = `${wId}_${part.id}`;
  const ctxLabel = partContext(ctx, part, sectionName === 'ministry');

  const addHelper = () => {
    const after = sectionName === 'ministry'
      ? { ...part, roleLabel: '學生/助手' }
      : { ...part, hideHelper: false };
    toggleHelperSlot?.(part, sectionName, true);
    openSheet(`${baseId}_1`, slotCat(after, '1'), partContext(ctx, after, sectionName === 'ministry'), '', {
      removeLabel: helperLabel,
      onRemoveSlot: () => toggleHelperSlot?.(part, sectionName, false),
    });
  };
  const secondOpts = editMode && isPair && canTakeSecond
    ? {
      removeLabel: helperLabel,
      onRemoveSlot: () => toggleHelperSlot?.(part, sectionName, false),
    }
    : undefined;

  return (
    <>
      {part.roleLabel && <span className="role-label">{part.roleLabel}</span>}
      {isPair ? (
        <PairSlot
          baseId={baseId}
          catKeys={[slotCat(part, '0'), slotCat(part, '1')]}
          ctxLabel={ctxLabel}
          defaultNames={part.assign}
          roleLabels={roleLabels}
          getAssign={getAssign}
          openSheet={openSheet}
          getSuggestion={getSuggestion}
          onAccept={onAccept}
          onClear={onClear}
          secondOpts={secondOpts}
        />
      ) : (
        <WhoSlot
          slotId={`${baseId}_0`}
          catKey={slotCat(part, '0')}
          ctxLabel={ctxLabel}
          defaultName={part.assign?.[0] ?? ''}
          getAssign={getAssign}
          openSheet={openSheet}
          getSuggestion={getSuggestion}
          onAccept={onAccept}
          onClear={onClear}
        />
      )}
      {editMode && canTakeSecond && !isPair && (
        <button
          type="button"
          className="who who--ghost-add"
          aria-label={`為「${part.title}」加入${helperLabel}欄位`}
          onClick={addHelper}
        >
          ＋ {helperLabel}
        </button>
      )}
    </>
  );
}

function PartRow({ wId, ctx, sectionName, part, editMode, isOpen, onOpen, getAssign, openSheet, getSuggestion, onAccept, onClear, toggleHelperSlot }) {
  return (
    <div className={`row${isOpen ? ' row--open' : ''}`} data-part-key={part.id}>
      <RowMain
        as={editMode ? 'button' : 'div'}
        editKey={part.id}
        label={`編輯第${part.partNum}項 ${part.title}`}
        onClick={onOpen}
      >
        <span className="row__time">{part.time}</span>
        <span className="dotwrap">
          <span className={`dot ${sectionName === 'ministry' ? 'dot--ministry' : sectionName === 'living' ? 'dot--living' : 'dot--treasures'}`} />
          <span className="partnum">{part.partNum}</span>
        </span>
        <span className="row__part">
          <span className="row__part-main">{part.title} <span className="dur">（{part.dur}）</span></span>
          {part.cbsRef && <span className="cbs-ref">{part.cbsRef}</span>}
          {sectionName === 'ministry' && part.scenario && <span className="row__scenario">{part.scenario}</span>}
        </span>
      </RowMain>
      <span className="row__assign">
        <Assignees
          part={part} wId={wId} ctx={ctx} sectionName={sectionName} editMode={editMode}
          getAssign={getAssign} openSheet={openSheet} getSuggestion={getSuggestion}
          onAccept={onAccept} onClear={onClear} toggleHelperSlot={toggleHelperSlot}
        />
      </span>
    </div>
  );
}

function PartInlineEditor({ part, sectionName, baseEnd, currentEnd, onChange, onDuration, onRequestDelete, onClose }) {
  const titleRef = useRef(null);
  useFineFocus(titleRef);
  const minutes = parseDuration(part.dur) ?? 1;
  const effect = timeDifference(baseEnd, currentEnd);
  // The first two sections are immutable apart from their text fields; only
  // living gets the duration stepper and the delete action (cbs included).
  const isLiving = sectionName === 'living';

  return (
    <div className="mw-inline" data-editor-for={part.id}>
      <div className="mw-inline__body">
        <label className="mw-field mw-field--wide">
          <span className="mw-field__label">標題</span>
          <input
            ref={titleRef}
            className="week-edit__input mw-input--full"
            type="text"
            value={part.title ?? ''}
            aria-label={`編輯第${part.partNum}項標題`}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </label>
        {isLiving && (
          <div className="mw-field">
            <span className="mw-field__label">時長</span>
            <div className="mw-stepper">
              <button type="button" aria-label={`${part.title} 減少一分鐘`} onClick={() => onDuration(Math.max(1, minutes - 1))}><Icon name="minus" /></button>
              <span className="mw-stepper__val">{minutes} 分鐘</span>
              <button type="button" aria-label={`${part.title} 增加一分鐘`} onClick={() => onDuration(minutes + 1)}><Icon name="plus" /></button>
            </div>
            <div className="mw-inline__effect">
              結束 {currentEnd || '—'}
              {effect ? <span className={effect > 0 ? 'mw-late' : ''}> ・ {effect > 0 ? '延後' : '提早'} {Math.abs(effect)} 分鐘</span> : null}
            </div>
          </div>
        )}
        <label className="mw-field">
          <span className="mw-field__label">開始時間</span>
          <input
            className="week-edit__input week-edit__input--time"
            type="text"
            value={part.time ?? ''}
            aria-label={`編輯第${part.partNum}項時間`}
            onChange={(e) => onChange({ time: e.target.value })}
          />
        </label>
        {sectionName === 'ministry' && (
          <label className="mw-field mw-field--wide">
            <span className="mw-field__label">情境</span>
            <textarea
              className="week-edit__input mw-textarea"
              value={part.scenario ?? ''}
              aria-label="情境"
              rows={2}
              onChange={(e) => onChange({ scenario: e.target.value })}
            />
          </label>
        )}
      </div>
      <div className="mw-inline__foot">
        {isLiving && (
          <button type="button" className="mw-textbtn mw-textbtn--danger" onClick={onRequestDelete}>刪除節目</button>
        )}
        <span className="mw-spacer" />
        <button type="button" className="btn btn--sm" onClick={onClose}>完成</button>
      </div>
    </div>
  );
}

function InsertSeam({ seamKey, label, onOpen }) {
  return (
    <div className="mw-seam-row">
      <button type="button" className="mw-seam" data-seam={seamKey} aria-label={label} onClick={onOpen}>
        <Icon name="plus" />
      </button>
    </div>
  );
}

function AddInlineEditor({ section, parts, afterPartKey, busy, onCancel, onSubmit }) {
  const titleRef = useRef(null);
  useFineFocus(titleRef);
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(5);
  const { options, defaultKey } = timeSourceOptions(parts, minutes);
  const [source, setSource] = useState(defaultKey);
  const chosen = options.find((option) => option.key === source) ?? options[0];

  const sectionStart = parts[0]?.time ?? '';
  const oldEnd = recomputeSectionTimes(parts, sectionStart).end;
  const adjustMap = new Map(chosen.adjust.map((item) => [item.partKey, item.dur]));
  const virtual = parts.map((part) => ({
    ...part,
    partKey: part.id,
    dur: adjustMap.get(part.id) ?? part.dur,
  }));
  const insertIndex = afterPartKey === null ? 0 : Math.max(0, virtual.findIndex((part) => part.id === afterPartKey) + 1);
  virtual.splice(insertIndex, 0, {
    id: '__new__', partKey: '__new__', partNum: 0, dur: `${minutes} 分鐘`, title: title.trim() || '新節目',
  });
  virtual.forEach((part, index) => { part.partNum = index + 1; });
  const plan = recomputeSectionTimes(virtual, sectionStart);
  const newTime = plan.updates.find((entry) => entry.partKey === '__new__')?.time ?? '';
  const end = plan.end;
  const delta = timeDifference(oldEnd, end);

  const submit = (event) => {
    event.preventDefault();
    if (!title.trim() || busy) return;
    onSubmit({
      section,
      afterPartKey,
      title: title.trim(),
      dur: `${minutes} 分鐘`,
      time: newTime,
      cat: 'living',
      roleLabel: null,
      adjust: chosen.adjust,
    });
  };

  return (
    <form className="mw-addinline" onSubmit={submit}>
      <div className="mw-inline__body">
        <label className="mw-field mw-field--wide">
          <span className="mw-field__label">新節目名稱</span>
          <input
            ref={titleRef}
            className="week-edit__input mw-input--full"
            type="text"
            value={title}
            placeholder="新節目名稱"
            aria-label="新增節目名稱"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="mw-field">
          <span className="mw-field__label">時長</span>
          <div className="mw-stepper">
            <button type="button" aria-label="新節目 減少一分鐘" onClick={() => setMinutes((v) => Math.max(1, v - 1))}><Icon name="minus" /></button>
            <span className="mw-stepper__val">{minutes} 分鐘</span>
            <button type="button" aria-label="新節目 增加一分鐘" onClick={() => setMinutes((v) => v + 1)}><Icon name="plus" /></button>
          </div>
        </div>
        <fieldset className="mw-field mw-field--wide mw-sources">
          <legend className="mw-field__label">時間從哪裡扣？</legend>
          <div className="mw-sources__chips">
            {options.map((option) => {
              const fullLabel = option.fullTitle
                ? `${option.fullTitle} ${option.from}→${option.to}`
                : option.label;
              return (
                <label
                  key={option.key}
                  className={`mw-chip${source === option.key ? ' mw-chip--on' : ''}`}
                  title={fullLabel}
                  aria-label={fullLabel}
                >
                  <input type="radio" name="mw-time-source" value={option.key} checked={source === option.key} onChange={() => setSource(option.key)} />
                  <span>{option.label}</span>
                </label>
              );
            })}
          </div>
          {source === 'spread' && chosen.changes?.length > 0 && (
            <div className="mw-sources__detail">
              {chosen.changes.map((change) => `${change.title ?? ''} ${change.from}→${change.to}`).join(' · ')}
              {chosen.shortfall > 0 ? ` ・ 仍延後 ${chosen.shortfall} 分鐘` : ''}
            </div>
          )}
        </fieldset>
      </div>
      <div className="mw-inline__status">
        結束 {end || '—'}
        {delta ? <span className={delta > 0 ? 'mw-late' : ''}> ・ {delta > 0 ? '延後' : '提早'} {Math.abs(delta)} 分鐘</span> : <Icon name="check" className="mw-ok" />}
      </div>
      <div className="mw-inline__foot">
        <button type="button" className="btn btn--sm" onClick={onCancel}>取消</button>
        <span className="mw-spacer" />
        <button type="submit" className="btn btn--primary btn--sm" disabled={!title.trim() || busy}>{busy ? '儲存中…' : '新增'}</button>
      </div>
    </form>
  );
}

function SmallInlineEditor({ label, value, onChange, onClose, multiline, type = 'text' }) {
  const inputRef = useRef(null);
  useFineFocus(inputRef);
  return (
    <div className="mw-inline mw-inline--small">
      <div className="mw-inline__body">
        <label className="mw-field mw-field--wide">
          <span className="mw-field__label">{label}</span>
          {multiline ? (
            <textarea ref={inputRef} className="week-edit__input mw-textarea" value={value ?? ''} rows={2} onChange={(e) => onChange(e.target.value)} />
          ) : (
            <input ref={inputRef} className="week-edit__input mw-input--full" type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
          )}
        </label>
      </div>
      <div className="mw-inline__foot">
        <span className="mw-spacer" />
        <button type="button" className="btn btn--sm" onClick={onClose}>完成</button>
      </div>
    </div>
  );
}

export default function MidweekWeek({ week, editMode, getAssign, openSheet, updateMidweekWeek, addMidweekPart, deleteMidweekPart, cardRef, getSuggestion, onAccept, onClear, clearSlot, onFinishEdit }) {
  const wId = `mw${week.id}`;
  const ctx = week.date;
  const [draftWeek, setDraftWeek] = useState(week);
  const [hiddenHelpers, setHiddenHelpers] = useState(() => initHiddenHelpers(week));
  const [openEditor, setOpenEditor] = useState(null); // { type: 'part'|'add'|'song'|'closing', ... }
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const [snackbar, setSnackbar] = useState(null);
  const [addingBusy, setAddingBusy] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const shownWeek = editMode ? draftWeek : week;

  useEffect(() => {
    if (!editMode) { setOpenEditor(null); setConfirmingDelete(null); setSnackbar(null); }
  }, [editMode]);

  useEffect(() => {
    setDraftWeek(week);
    setHiddenHelpers(initHiddenHelpers(week));
    setOpenEditor(null);
    setConfirmingDelete(null);
    setSnackbar(null);
    setAddingBusy(false);
    setDeletingBusy(false);
  }, [week.id]);

  useEffect(() => {
    if (!snackbar) return undefined;
    const timer = setTimeout(() => setSnackbar(null), snackbar.restore ? 8000 : 3000);
    return () => clearTimeout(timer);
  }, [snackbar]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (confirmingDelete) setConfirmingDelete(null);
      else if (openEditor) setOpenEditor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmingDelete, openEditor]);

  const applyPatch = (patch) => {
    setDraftWeek((current) => ({ ...current, ...patch }));
    updateMidweekWeek(week.id, (current) => ({ ...current, ...patch }));
  };
  const updateDraftPart = (sectionName, partId, patch) => {
    const apply = (current) => ({
      ...current,
      [sectionName]: current[sectionName].map((part) => (part.id === partId ? { ...part, ...patch } : part)),
    });
    setDraftWeek(apply);
    updateMidweekWeek(week.id, apply);
  };

  const toggleHelperSlot = (part, sectionName, showHelper) => {
    if (!showHelper) clearSlot?.(`${wId}_${part.id}_1`);
    if (sectionName === 'ministry') {
      updateDraftPart(sectionName, part.id, {
        roleLabel: showHelper ? '學生/助手' : '學生',
        hideHelper: false,
      });
    } else {
      setHiddenHelpers((prev) => {
        const next = new Set(prev);
        if (showHelper) next.delete(part.id); else next.add(part.id);
        return next;
      });
      updateDraftPart(sectionName, part.id, { hideHelper: !showHelper });
    }
  };

  const stepDuration = (sectionName, part, minutes) => {
    const delta = minutes - (parseDuration(part.dur) ?? 0);
    if (!delta) return;
    const shifted = retimeClientWeek(shownWeek, { section: sectionName, partNum: part.partNum, delta });
    const patch = {
      treasures: shifted.treasures,
      ministry: shifted.ministry,
      living: shifted.living,
      midSongTime: shifted.midSongTime,
      closingTime: shifted.closingTime,
      closeSongTime: shifted.closeSongTime,
    };
    patch[sectionName] = shifted[sectionName].map((p) => (p.id === part.id ? { ...p, dur: `${minutes} 分鐘` } : p));
    applyPatch(patch);
  };

  const applyUpdates = (current, data, removedKey) => {
    const next = { ...current };
    const updates = new Map((data.updates ?? []).map((item) => [item.partKey, item]));
    for (const section of SECTIONS) {
      next[section] = (current[section] ?? [])
        .filter((part) => part.id !== removedKey)
        .map((part) => {
          const update = updates.get(part.id);
          if (!update) return part;
          return {
            ...part,
            partNum: update.partNum,
            time: update.time,
            ...(update.dur !== undefined ? { dur: update.dur } : {}),
          };
        });
    }
    for (const field of ['midSongTime', 'closingTime', 'closeSongTime']) {
      if (data[field] !== undefined) next[field] = data[field];
    }
    return next;
  };

  const insertCreatedPart = (sectionName, afterPartKey, data) => {
    const apply = (current) => {
      const next = applyUpdates(current, data);
      const items = [...(next[sectionName] ?? [])];
      if (afterPartKey === null) {
        items.unshift(data.part);
      } else {
        const index = items.findIndex((part) => part.id === afterPartKey);
        if (index < 0) return current;
        items.splice(index + 1, 0, data.part);
      }
      next[sectionName] = items;
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
      setOpenEditor(null);
      openSheet?.(
        `${wId}_${data.part.id}_0`,
        slotCat(data.part, '0'),
        `${ctx} ・ ${data.part.title}`,
        data.part.assign?.[0] ?? '',
      );
    } finally {
      setAddingBusy(false);
    }
  };

  const focusAfterDelete = (sectionName, partKey) => {
    requestAnimationFrame(() => {
      const parts = shownWeek[sectionName] ?? [];
      const index = parts.findIndex((part) => part.id === partKey);
      const neighbour = parts[index + 1] ?? parts[index - 1];
      const selector = neighbour ? `[data-edit-key="${neighbour.id}"]` : `[data-seam="${sectionName}:${partKey}"]`;
      document.querySelector(selector)?.focus?.();
    });
  };

  const confirmDelete = async (part) => {
    const sectionName = SECTIONS.find((s) => shownWeek[s]?.some((p) => p.id === part.id));
    const beforeEnd = shownWeek.closingTime;
    setDeletingBusy(true);
    try {
      const data = await deleteMidweekPart?.(shownWeek, part.id);
      if (!data) return;
      const apply = (current) => applyUpdates(current, data, part.id);
      setDraftWeek(apply);
      updateMidweekWeek(week.id, apply);
      setConfirmingDelete(null);
      setOpenEditor(null);
      const afterEnd = data.closingTime ?? beforeEnd;
      const moved = timeDifference(beforeEnd, afterEnd);
      setSnackbar({
        msg: `已刪除「${part.title}」${moved ? ` ・ 結束${moved > 0 ? '延後' : '提早'} ${Math.abs(moved)} 分鐘` : ''}`,
        restore: data.restore,
      });
      focusAfterDelete(sectionName, part.id);
    } finally {
      setDeletingBusy(false);
    }
  };

  const undoDelete = async () => {
    const restore = snackbar?.restore;
    if (!restore) return;
    setSnackbar(null);
    setAddingBusy(true);
    try {
      const data = await addMidweekPart?.(shownWeek, restore);
      if (!data) return;
      insertCreatedPart(restore.section, restore.afterPartKey, data);
      setSnackbar({ msg: '已復原' });
    } finally {
      setAddingBusy(false);
    }
  };

  const renderDeleteConfirm = (part) => {
    const roleCount = part.roleLabel?.includes('/') ? 2 : 1;
    const names = [];
    for (let i = 0; i < roleCount; i++) {
      const name = getAssign(`${wId}_${part.id}_${i}`);
      if (name) names.push(name);
    }
    return (
      <div className="mw-delconfirm" key={`confirm:${part.id}`}>
        <div className="mw-delconfirm__text">
          <div className="mw-delconfirm__title">刪除「{part.title}」？</div>
          {names.length > 0 && <div className="mw-delconfirm__names">已指派的 {names.join('、')} 也會一併清除</div>}
        </div>
        <div className="mw-delconfirm__actions">
          <button className="btn btn--sm" type="button" disabled={deletingBusy} onClick={() => setConfirmingDelete(null)}>取消</button>
          <button className="btn btn--danger btn--sm" type="button" disabled={deletingBusy} onClick={() => confirmDelete(part)}>{deletingBusy ? '刪除中…' : '刪除'}</button>
        </div>
      </div>
    );
  };

  const requestDelete = (part) => {
    const count = part.roleLabel?.includes('/') ? 2 : 1;
    const assigned = Array.from({ length: count }, (_, i) => getAssign(`${wId}_${part.id}_${i}`)).some(Boolean);
    setOpenEditor(null);
    if (assigned) setConfirmingDelete(part.id);
    else confirmDelete(part);
  };

  const renderSeam = (sectionName, afterPartKey, seamKey, label) => {
    const isOpen = openEditor?.type === 'add' && openEditor.section === sectionName && openEditor.afterPartKey === afterPartKey;
    return (
      <Fragment key={`seam:${seamKey}`}>
        <InsertSeam
          seamKey={seamKey}
          label={`在${label}之後插入節目`}
          onOpen={() => { setConfirmingDelete(null); setOpenEditor({ type: 'add', section: sectionName, afterPartKey }); }}
        />
        {isOpen && (
          <AddInlineEditor
            section={sectionName}
            parts={shownWeek[sectionName] ?? []}
            afterPartKey={afterPartKey}
            busy={addingBusy}
            onCancel={() => setOpenEditor(null)}
            onSubmit={submitNewPart}
          />
        )}
      </Fragment>
    );
  };

  const renderParts = (sectionName) => {
    const parts = shownWeek[sectionName] ?? [];
    const out = [];
    // Domain rule: the first two sections never change — seams only in living.
    const seams = editMode && sectionName === 'living';
    if (seams) out.push(renderSeam(sectionName, null, `${sectionName}--start`, `${SECTION_LABELS[sectionName]}開始`));
    for (const part of parts) {
      if (editMode && confirmingDelete === part.id) {
        out.push(renderDeleteConfirm(part));
      } else {
        const isOpen = editMode && openEditor?.type === 'part' && openEditor.key === part.id;
        out.push(
          <PartRow
            key={part.id}
            wId={wId}
            ctx={ctx}
            sectionName={sectionName}
            part={part}
            editMode={editMode}
            isOpen={isOpen}
            onOpen={() => { setConfirmingDelete(null); setOpenEditor(isOpen ? null : { type: 'part', key: part.id, section: sectionName, baseEnd: shownWeek.closingTime }); }}
            getAssign={getAssign}
            openSheet={openSheet}
            getSuggestion={getSuggestion}
            onAccept={onAccept}
            onClear={onClear}
            toggleHelperSlot={toggleHelperSlot}
          />,
        );
        if (isOpen) {
          out.push(
            <PartInlineEditor
              key={`editor:${part.id}`}
              part={part}
              sectionName={sectionName}
              baseEnd={openEditor.baseEnd}
              currentEnd={shownWeek.closingTime}
              onChange={(patch) => updateDraftPart(sectionName, part.id, patch)}
              onDuration={(minutes) => stepDuration(sectionName, part, minutes)}
              onRequestDelete={() => requestDelete(part)}
              onClose={() => setOpenEditor(null)}
            />,
          );
        }
      }
      // cbs is editable like any other living part, including insertion after it.
      if (seams) out.push(renderSeam(sectionName, part.id, `${sectionName}:${part.id}`, part.title));
    }
    return out;
  };

  const renderBand = (sectionName) => (
    <div className={`band band--${sectionName}`}>
      <span className="band__title">{SECTION_LABELS[sectionName]}</span>
      {editMode && <span className="mw-band-end">至 {sectionEnd(shownWeek[sectionName] ?? [])}</span>}
    </div>
  );

  const songRow = (partKey, time, number, label, openKey, extraAssign) => {
    const isOpen = editMode && openEditor?.type === 'song' && openEditor.key === openKey;
    return (
      <Fragment key={partKey}>
        <div className={`row row--song${isOpen ? ' row--open' : ''}`} data-part-key={partKey}>
          <RowMain
            as={editMode ? 'button' : 'div'}
            editKey={partKey}
            label={`編輯${label}`}
            onClick={() => { setConfirmingDelete(null); setOpenEditor(isOpen ? null : { type: 'song', key: openKey }); }}
          >
            <span className="row__time">{time}</span>
            <span className="dotwrap"><span className={`dot ${partKey === 'song-open' ? 'dot--treasures' : 'dot--living'}`} /></span>
            <span className="row__part">唱詩　{number} 首</span>
          </RowMain>
          <span className="row__assign">{extraAssign}</span>
        </div>
        {isOpen && (
          <SmallInlineEditor
            label={label}
            value={number}
            type="number"
            onChange={(value) => applyPatch({ [openKey]: value })}
            onClose={() => setOpenEditor(null)}
          />
        )}
      </Fragment>
    );
  };

  const weekType = week.type ?? 'normal';
  const weekLabel = week.label ?? '';
  const suspended = isMidweekSuspended(week);
  const cardClass = weekType === 'special' ? 'card card--special'
                  : suspended ? 'card card--assembly'
                  : 'card';

  if (suspended) {
    return (
      <article className={`${cardClass} card--suspended`} ref={cardRef}>
        <div className="mw-susp">
          <span className="mw-susp__date">{shownWeek.date}</span>
          <span className="mw-susp__sep" aria-hidden="true" />
          <span className="mw-susp__text">{suspendedNotice(week)}</span>
        </div>
      </article>
    );
  }

  const closingOpen = editMode && openEditor?.type === 'closing';

  return (
    <>
      <article className={cardClass} ref={cardRef}>
        {editMode && (
          <div className="mw-editbar">
            <span>編輯中 ・ 點節目即可修改</span>
            <button type="button" className="btn btn--primary btn--sm" onClick={onFinishEdit}>完成</button>
          </div>
        )}
        <div className="mw-head">
          <div className="mw-head__date">
            <TextField editMode={editMode} value={shownWeek.date} onChange={(value) => applyPatch({ date: value })} className="mw-head__date-value" editClassName="mw-quiet-input--date" ariaLabel="聚會日期" />
          </div>
          <div className="mw-head__main">
            <div className="mw-head__sub">
              <TextField editMode={editMode} value={shownWeek.weekdayPill} onChange={(value) => applyPatch({ weekdayPill: value })} className="weekday-pill" editClassName="mw-quiet-input--pill" ariaLabel="星期與時間" />
              {weekLabel && <span className={`mw-type-badge mw-type-badge--${weekType}`}>{weekLabel}</span>}
              <span className="mw-head__reading">
                每週閱讀經文　
                <TextField editMode={editMode} value={shownWeek.reading} onChange={(value) => applyPatch({ reading: value })} className="mw-head__reading-value" editClassName="mw-quiet-input--reading" bold ariaLabel="每週閱讀經文" />
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
            <div className={`row row--song${editMode && openEditor?.type === 'song' && openEditor.key === 'openSong' ? ' row--open' : ''}`}>
              <RowMain as="div">
                <span className="row__time">7:30</span>
                <span className="dotwrap"><span className="dot dot--treasures" /></span>
                <span className="row__part">
                  {editMode ? <button type="button" className="row__inlinebtn" aria-label="編輯開場唱詩首數" onClick={() => { setConfirmingDelete(null); setOpenEditor(openEditor?.key === 'openSong' ? null : { type: 'song', key: 'openSong' }); }}>唱詩　{shownWeek.openSong} 首</button> : <>唱詩　{shownWeek.openSong} 首</>}
                  ・開場白 <span className="dur">（1 分鐘）</span>
                </span>
              </RowMain>
              <span className="row__assign" />
            </div>
            {editMode && openEditor?.type === 'song' && openEditor.key === 'openSong' && <SmallInlineEditor label="開場唱詩首數" value={shownWeek.openSong} type="number" onChange={(value) => applyPatch({ openSong: value })} onClose={() => setOpenEditor(null)} />}
          </div>

          {renderBand('treasures')}
          <div className="rows">{renderParts('treasures')}</div>

          {renderBand('ministry')}
          <div className="rows">{renderParts('ministry')}</div>

          {renderBand('living')}
          <div className="rows">
            {songRow('song-mid', shownWeek.midSongTime, shownWeek.midSong, '中場唱詩首數', 'midSong')}
            {renderParts('living')}
            <div className={`row${closingOpen ? ' row--open' : ''}`} data-part-key="closing">
              <RowMain as="div">
                <span className="row__time">{shownWeek.closingTime}</span>
                <span className="dotwrap"><span className="dot dot--living" /></span>
                <span className="row__part">
                  {editMode ? <button type="button" className="row__inlinebtn" aria-label="編輯結語時長" onClick={() => { setConfirmingDelete(null); setOpenEditor(closingOpen ? null : { type: 'closing' }); }}>結語</button> : '結語'} <span className="dur">（{shownWeek.closingDur}）</span>・
                  {editMode ? <button type="button" className="row__inlinebtn" aria-label="編輯結束唱詩首數" onClick={() => { setConfirmingDelete(null); setOpenEditor(openEditor?.key === 'closeSong' ? null : { type: 'song', key: 'closeSong' }); }}>唱詩　{shownWeek.closeSong} 首</button> : <>唱詩　{shownWeek.closeSong} 首</>}
                </span>
              </RowMain>
              <span className="row__assign"><span className="role-label">結束禱告</span><WhoSlot slotId={`${wId}_closePrayer`} catKey="prayer" ctxLabel={ctx} defaultName={shownWeek.closePrayer} getAssign={getAssign} openSheet={openSheet} getSuggestion={getSuggestion} onAccept={onAccept} onClear={onClear} /></span>
            </div>
            {closingOpen && (
              <SmallInlineEditor
                label="結語時長"
                value={shownWeek.closingDur}
                onChange={(value) => applyPatch({ closingDur: value })}
                onClose={() => setOpenEditor(null)}
              />
            )}
            {editMode && openEditor?.type === 'song' && openEditor.key === 'closeSong' && <SmallInlineEditor label="結束唱詩首數" value={shownWeek.closeSong} type="number" onChange={(value) => applyPatch({ closeSong: value })} onClose={() => setOpenEditor(null)} />}
          </div>
        </div>
      </article>

      {snackbar && (
        <div className="mw-snack" role="status" aria-live="polite">
          <span>{snackbar.msg}</span>
          {snackbar.restore && <button type="button" className="mw-snack__undo" onClick={undoDelete}>復原</button>}
          <button type="button" className="mw-snack__close" aria-label="關閉" onClick={() => setSnackbar(null)}>✕</button>
        </div>
      )}
    </>
  );
}

function TextField({ editMode, value, onChange, className, ariaLabel, editClassName, bold }) {
  if (!editMode) {
    return bold
      ? <b className={className}>{value}</b>
      : <span className={className}>{value}</span>;
  }
  return (
    <input
      className={`week-edit__input mw-quiet-input ${editClassName ?? ''}`}
      type="text"
      value={value ?? ''}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function initHiddenHelpers(week) {
  const allParts = [...(week.treasures ?? []), ...(week.ministry ?? []), ...(week.living ?? [])];
  return new Set(allParts.filter((part) => part.hideHelper).map((part) => part.id));
}
