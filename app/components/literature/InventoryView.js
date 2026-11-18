'use client';
import Icon from './Icon';
import Menu from './Menu';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Sheet } from './PubThumb';
import CountSheet from './CountSheet';

const json = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const currentMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export default function InventoryView({ items, people, request, reloadCatalog }) {
  const fileInput = useRef(null);
  const [counts, setCounts] = useState([]);
  const [selected, setSelected] = useState(null);
  const month = currentMonth();
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderPersonId, setReminderPersonId] = useState(null);
  const [personQuery, setPersonQuery] = useState('');
  const [reminderError, setReminderError] = useState('');

  async function openReminder() {
    setReminderError('');
    setPersonQuery('');
    setReminderOpen(true);
    try {
      const result = await request('/api/literature/inventory/reminder');
      setReminderPersonId(result.personId);
    } catch (err) {
      setReminderError(err.message);
    }
  }

  async function saveReminder(personId) {
    setBusy(true);
    setReminderError('');
    try {
      const result = await request('/api/literature/inventory/reminder', json('PATCH', { personId }));
      setReminderPersonId(result.personId);
      setReminderOpen(false);
    } catch (err) {
      setReminderError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const load = useCallback(async () => {
    try {
      setCounts((await request('/api/literature/inventory')).counts);
    } catch (err) {
      setError(err.message);
    }
  }, [request]);

  useEffect(() => {
    load();
  }, [load]);

  async function start() {
    try {
      const result = await request('/api/literature/inventory', json('POST', { month }));
      setSelected(result.count.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function upload(chosen, previewOnly) {
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', chosen);
      const path = `/api/literature/inventory/import-report${previewOnly ? '?preview=1' : ''}`;
      const result = await request(path, { method: 'POST', body });
      if (previewOnly) {
        setFile(chosen);
        setPreview(result);
      } else {
        setPreview(null);
        await reloadCatalog();
        await load();
        setSelected(result.count.id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (selected) {
    return (
      <CountSheet
        id={selected}
        items={items}
        request={request}
        onBack={() => {
          setSelected(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="lit-detail">
      <div className="lit-header">
        <h1>每月清點</h1>
        <Menu items={[
          { label: '書刊負責人', onSelect: openReminder },
          ...(counts.length > 0 ? [{ label: '匯入 JW Hub 庫存報告', onSelect: () => fileInput.current?.click() }] : []),
        ]} />
        {counts.length > 0 && <>
          <input
            ref={fileInput}
            className="lit-file"
            type="file"
            accept="application/pdf"
            disabled={busy}
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              e.target.value = '';
              if (chosen) upload(chosen, true);
            }}
          />
        </>}
      </div>
      <div className="lit-inventory-controls">
        {!counts.some((count) => count.month === month) && (
          <button className="btn btn--primary" onClick={start}>開始 {Number(month.slice(5))} 月清點</button>
        )}
        {!counts.length && <label className="btn btn--sm">
          匯入 JW Hub 庫存報告
          <input className="lit-file" type="file" accept="application/pdf" disabled={busy} onChange={(e) => {
            const chosen = e.target.files?.[0];
            e.target.value = '';
            if (chosen) upload(chosen, true);
          }} />
        </label>}
      </div>
      {error && <div className="imp-error" role="alert">{error}</div>}
      <div className="lit-shipment-list">
        {counts.map((count) => (
          <button className="lit-shipment" key={count.id} onClick={() => setSelected(count.id)}>
            <strong>
              {count.month.replace(/^(\d{4})-(\d{2})$/, (_, year, number) => `${year}年${Number(number)}月`)} <span className="lit-badge">{count.status === 'done' ? '完成' : '草稿'}</span>
            </strong>
            <span>已清點 {count.counted} / {count.total}</span>
          </button>
        ))}
      </div>
      {!counts.length && <p>尚無清點紀錄。</p>}
      {reminderOpen && (
        <Sheet title="書刊負責人" close={() => setReminderOpen(false)}>
          <p>清點截止提醒會放進他的行事曆；表單有新申請時會用 LINE 通知他</p>
          <p>目前：{people.find((person) => String(person.id) === String(reminderPersonId))?.name || '不提醒'}</p>
          <label className="field">
            <span className="field__label">搜尋人員</span>
            <input
              className="field__input"
              placeholder="搜尋姓名"
              value={personQuery}
              onChange={(event) => setPersonQuery(event.target.value)}
            />
          </label>
          {reminderError && <div className="imp-error" role="alert">{reminderError}</div>}
          <div className="lit-picker">
            <button type="button" disabled={busy} onClick={() => saveReminder(null)}>不提醒</button>
            {people.filter((person) => person.name.includes(personQuery.trim())).map((person) => (
              <button type="button" key={person.id} disabled={busy} onClick={() => saveReminder(person.id)}>
                {person.name}
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {preview && (
        <Sheet title="確認庫存報告" close={() => setPreview(null)}>
          <p>{preview.month} · {preview.language} · {preview.rows.length} 項</p>
          {preview.duplicate && <div className="imp-error">此月份已完成清點。</div>}
          {preview.rows.map((row) => (
            <div className="lit-preview-line" key={row.code}>
              <span>{row.code} · {row.name} {row.action === 'create' && '（將新增）'}</span>
              <strong>{row.quantity}</strong>
            </div>
          ))}
          {error && <div className="imp-error">{error}</div>}
          <button className="btn btn--primary" disabled={busy || preview.duplicate} onClick={() => upload(file, false)}>
            確認匯入
          </button>
        </Sheet>
      )}
    </div>
  );
}
