'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from './literature/Icon';
import { parseDuration, planCompression, recomputeSectionTimes, timeDifference } from '../lib/midweekParts.mjs';

const DEFAULT_MINUTES = 5;

export default function PartTimelineSheet({ section, sectionName, ctx, parts, afterPartKey, onClose, onSubmit, busy }) {
  const titleRef = useRef(null);
  const [title, setTitle] = useState('');
  const [newMinutes, setNewMinutes] = useState(DEFAULT_MINUTES);
  const [cat, setCat] = useState(section === 'ministry' ? 'ministry' : section === 'living' ? 'living' : 'treasures');
  const [ministryRole, setMinistryRole] = useState('pair');
  const [touched, setTouched] = useState(() => new Set());
  const initialIndex = afterPartKey === null
    ? 0
    : Math.max(0, parts.findIndex((part) => part.id === afterPartKey) + 1);
  const [insertIndex, setInsertIndex] = useState(initialIndex);

  const original = Object.fromEntries(parts.map((part) => [part.id, parseDuration(part.dur) ?? 0]));
  const [minutes, setMinutes] = useState(() => {
    const plan = planCompression(parts, DEFAULT_MINUTES);
    const next = Object.fromEntries(parts.map((part) => [part.id, original[part.id]]));
    for (const change of plan.changes) next[change.partKey] = change.to;
    return next;
  });

  useEffect(() => {
    const timer = setTimeout(() => titleRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Re-plan from the original durations. Parts the user stepped by hand stay
  // where the user put them; only untouched parts absorb the remaining minutes.
  function replan(nextNewMinutes, nextMinutes, nextTouched) {
    const achieved = [...nextTouched].reduce((sum, key) => (
      sum + (original[key] - (nextMinutes[key] ?? original[key]))
    ), 0);
    const remaining = Math.max(0, nextNewMinutes - achieved);
    const plan = planCompression(parts.filter((part) => !nextTouched.has(part.id)), remaining);
    const next = Object.fromEntries(parts.map((part) => [part.id, original[part.id]]));
    for (const key of nextTouched) next[key] = nextMinutes[key] ?? original[key];
    for (const change of plan.changes) next[change.partKey] = change.to;
    return next;
  }

  function changeNewMinutes(value) {
    const next = Math.max(1, Number(value) || 1);
    setNewMinutes(next);
    setMinutes((current) => replan(next, current, touched));
  }

  function stepPart(key, delta) {
    const nextValue = Math.max(1, (minutes[key] ?? original[key]) + delta);
    const nextTouched = new Set(touched);
    nextTouched.add(key);
    const nextMinutes = { ...minutes, [key]: nextValue };
    setTouched(nextTouched);
    setMinutes(replan(newMinutes, nextMinutes, nextTouched));
  }

  const hasCbs = section === 'living' && parts.some((part) => part.id === 'cbs');
  const maxIndex = hasCbs ? parts.length - 1 : parts.length;

  function movePart(delta) {
    const next = Math.max(0, Math.min(maxIndex, insertIndex + delta));
    setInsertIndex(next);
    setMinutes((current) => replan(newMinutes, current, touched));
  }

  function restore() {
    setTouched(new Set());
    setMinutes(Object.fromEntries(parts.map((part) => [part.id, original[part.id]])));
  }

  const virtualParts = parts.map((part) => ({
    ...part,
    partKey: part.id,
    dur: `${minutes[part.id] ?? original[part.id]} 分鐘`,
  }));
  virtualParts.splice(insertIndex, 0, {
    id: '__new__',
    partKey: '__new__',
    partNum: 0,
    title: title.trim() || '新節目',
    dur: `${newMinutes} 分鐘`,
    isNew: true,
  });
  virtualParts.forEach((part, index) => { part.partNum = index + 1; });

  const sectionStart = parts[0]?.time ?? '';
  const originalEnd = recomputeSectionTimes(parts, sectionStart).end;
  const result = recomputeSectionTimes(virtualParts, sectionStart);
  const timesByKey = new Map(result.updates.map((entry) => [entry.partKey, entry.time]));
  const newTime = timesByKey.get('__new__') ?? '';
  const delta = timeDifference(originalEnd, result.end);
  const totalMinutes = virtualParts.reduce((sum, part) => sum + (parseDuration(part.dur) ?? 0), 0);
  const finalAfterPartKey = insertIndex === 0 ? null : virtualParts[insertIndex - 1].partKey;

  const roleLabel = section === 'ministry'
    ? (cat === 'ministrytalk' ? '學生' : ministryRole === 'pair' ? '學生/助手' : '學生')
    : cat === 'reading' ? '學生' : null;

  function submit(event) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    onSubmit({
      section,
      afterPartKey: finalAfterPartKey,
      title: title.trim(),
      dur: `${newMinutes} 分鐘`,
      time: newTime,
      cat,
      roleLabel,
      adjust: parts
        .filter((part) => (minutes[part.id] ?? original[part.id]) !== original[part.id])
        .map((part) => ({ partKey: part.id, dur: `${minutes[part.id]} 分鐘` })),
    });
  }

  return (
    <div
      className="sheet-backdrop open"
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="sheet pts-sheet" role="dialog" aria-modal="true" aria-label={`新增節目 · ${sectionName}`}>
        <div className="sheet__grab" />
        <header className="sheet__head">
          <div className="sheet__heads">
            <div className="sheet__role">新增節目 · {sectionName}</div>
            <div className="sheet__ctx">{ctx}</div>
          </div>
          <button className="sheet__close" aria-label="關閉" onClick={onClose}>✕</button>
        </header>

        <form className="pts-form" onSubmit={submit}>
          <div className="pts-fields">
            <label className="pts-title">
              <span className="pts-label">節目名稱</span>
              <input ref={titleRef} className="week-edit__input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="新節目名稱" aria-label="新增節目名稱" />
            </label>
            <div className="pts-fields__row">
              <div className="pts-stepper">
                <span className="pts-label">時長</span>
                <div className="pts-stepper__ctl">
                  <button type="button" aria-label="新節目 減少一分鐘" onClick={() => changeNewMinutes(newMinutes - 1)}><Icon name="minus" /></button>
                  <span className="pts-stepper__val">{newMinutes} 分鐘</span>
                  <button type="button" aria-label="新節目 增加一分鐘" onClick={() => changeNewMinutes(newMinutes + 1)}><Icon name="plus" /></button>
                </div>
              </div>
              {section === 'treasures' && (
                <label>
                  <span className="pts-label">類型</span>
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
                    <span className="pts-label">類型</span>
                    <select className="week-edit__input" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="新增節目類型">
                      <option value="ministry">傳道練習</option>
                      <option value="ministrytalk">傳道演講</option>
                    </select>
                  </label>
                  {cat === 'ministry' && (
                    <label>
                      <span className="pts-label">指派</span>
                      <select className="week-edit__input" value={ministryRole} onChange={(e) => setMinistryRole(e.target.value)} aria-label="傳道練習指派方式">
                        <option value="pair">學生＋助手</option>
                        <option value="single">學生</option>
                      </select>
                    </label>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="pts-list">
            <div className="pts-statusbar">
              <span>共 {totalMinutes} 分鐘</span>
              <span className={`pts-status${delta && delta > 0 ? ' pts-status--late' : ''}`}>
                結束 {result.end || '—'}{delta ? ` · ${delta > 0 ? '延後' : '提早'} ${Math.abs(delta)} 分鐘` : null}
                {!delta && <Icon name="check" className="pts-status__check" />}
              </span>
            </div>
            {virtualParts.map((part) => {
              const shown = part.isNew ? newMinutes : (minutes[part.id] ?? original[part.id]);
              return (
                <div className={`pts-row${part.isNew ? ' pts-row--new' : ''}`} key={part.partKey}>
                  <span className="pts-row__time">{timesByKey.get(part.partKey) ?? ''}</span>
                  <span className="pts-row__title" title={part.title}>
                    {part.isNew && !title.trim() ? <i>新節目</i> : part.title}
                  </span>
                  <span className="pts-row__step">
                    {!part.isNew && shown !== original[part.id] && (
                      <s className="pts-row__orig"><span className="sr-only">原本 {original[part.id]} 分鐘</span><span aria-hidden="true">{original[part.id]}</span></s>
                    )}
                    <button type="button" aria-label={`${part.title} 減少一分鐘`} onClick={() => part.isNew ? changeNewMinutes(newMinutes - 1) : stepPart(part.id, -1)}><Icon name="minus" /></button>
                    <span className="pts-row__minutes">{shown} 分鐘</span>
                    <button type="button" aria-label={`${part.title} 增加一分鐘`} onClick={() => part.isNew ? changeNewMinutes(newMinutes + 1) : stepPart(part.id, 1)}><Icon name="plus" /></button>
                  </span>
                  {part.isNew && (
                    <span className="pts-row__move">
                      <button type="button" aria-label="上移" disabled={insertIndex === 0} onClick={() => movePart(-1)}><Icon name="arrowUp" /></button>
                      <button type="button" aria-label="下移" disabled={insertIndex >= maxIndex} onClick={() => movePart(1)}><Icon name="arrowDown" /></button>
                    </span>
                  )}
                </div>
              );
            })}
            <button type="button" className="pts-restore" onClick={restore}>恢復原本時長</button>
          </div>

          <div className="pts-foot">
            <button className="btn" type="button" onClick={onClose}>取消</button>
            <button className="btn btn--primary" type="submit" disabled={!title.trim() || busy}>{busy ? '儲存中…' : '新增'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
