'use client';

import { useEffect, useState } from 'react';
import { Sheet } from '../literature/PubThumb';
import { PersonPicker } from '../ServicesPage';

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('無法讀取圖片'));
    };
    image.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      function encode(quality) {
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('無法處理圖片'));
            if (blob.size > 400 * 1024 && quality > 0.35) return encode(quality - 0.1);
            if (blob.size > 400 * 1024) return reject(new Error('圖片太大，請選擇較小的圖片'));
            resolve(blob);
          },
          'image/jpeg',
          quality,
        );
      }
      encode(0.8);
    };
    image.src = url;
  });
}

function FieldEditor({ meeting, month, people, request, close, reload, recentIds }) {
  const [form, setForm] = useState(() => ({
    date: meeting?.date || `${month}-01`,
    time: meeting?.time || '09:30',
    place: meeting?.place || '',
    leaderId: meeting?.leaderId || null,
    leaderName: meeting?.leaderName || '',
    territory: meeting?.territory || '',
    note: meeting?.note || '',
  }));
  const [images, setImages] = useState(meeting?.images || []);
  const [pending, setPending] = useState([]);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  function change(key, value) {
    setForm((old) => ({ ...old, [key]: value }));
  }
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { leaderName, ...payload } = form;
      const result = await request(
        meeting ? `/api/services/field/${meeting.id}` : '/api/services/field',
        {
          method: meeting ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      for (const file of pending) {
        const blob = await resizeImage(file);
        await request(`/api/services/field/${result.meeting.id}/images`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });
      }
      reload();
      close();
    } catch (e) {
      setError(`${e.message}。請重新開啟安排後確認已儲存的資料。`);
      reload();
    } finally {
      setBusy(false);
    }
  }
  async function removeImage(image) {
    try {
      await request(`/api/services/field/images/${image.id}`, { method: 'DELETE' });
      setImages(images.filter((item) => item.id !== image.id));
      reload();
    } catch (e) {
      setError(e.message);
    }
  }
  async function removeMeeting() {
    if (!window.confirm('確定要刪除這個傳道安排嗎？')) return;
    try {
      await request(`/api/services/field/${meeting.id}`, { method: 'DELETE' });
      reload();
      close();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <Sheet title={meeting ? '編輯傳道安排' : '新增傳道安排'} close={close}>
      <form className="service-form" onSubmit={save}>
        <div className="service-form-pair">
          <label className="field">
            <span className="field__label">日期</span>
            <input
              required
              type="date"
              className="field__input"
              value={form.date}
              onChange={(e) => change('date', e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field__label">時間</span>
            <input
              required
              type="time"
              className="field__input"
              value={form.time}
              onChange={(e) => change('time', e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span className="field__label">集合地點</span>
          <input
            required
            className="field__input"
            value={form.place}
            onChange={(e) => change('place', e.target.value)}
          />
        </label>
        <div className="field">
          <span className="field__label">帶頭的人</span>
          <button type="button" className="btn" onClick={() => setPicker(!picker)}>
            {form.leaderName || '選擇人員'}
          </button>
          {picker && (
            <PersonPicker
              people={people}
              recentIds={recentIds}
              select={(p) => {
                setForm({ ...form, leaderId: p.id, leaderName: p.name });
                setPicker(false);
              }}
            />
          )}
        </div>
        <label className="field">
          <span className="field__label">區域</span>
          <input
            className="field__input"
            value={form.territory}
            onChange={(e) => change('territory', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">備註</span>
          <textarea
            className="field__input"
            rows="3"
            value={form.note}
            onChange={(e) => change('note', e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field__label">區域圖片</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => {
              setPending([...pending, ...Array.from(e.target.files)]);
              e.target.value = '';
            }}
          />
        </label>
        <div className="service-images">
          {images.map((image) => (
            <div className="service-image" key={`image-${image.id}`}>
              <img src={image.url} alt="區域圖片" />
              <button type="button" aria-label="移除圖片" onClick={() => removeImage(image)}>
                ×
              </button>
            </div>
          ))}
          {pending.map((file, index) => (
            <div className="service-pending" key={`pending-${file.name}-${index}`}>
              {file.name}
              <button
                type="button"
                aria-label={`移除 ${file.name}`}
                onClick={() => setPending(pending.filter((_, i) => i !== index))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        {error && (
          <p className="service-error" role="alert">
            {error}
          </p>
        )}
        <div className="service-actions">
          {meeting && (
            <button type="button" className="btn service-danger" onClick={removeMeeting}>
              刪除
            </button>
          )}
          <button className="btn btn--primary" disabled={busy}>
            {busy ? '儲存中…' : '儲存'}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export default function FieldView({
  data,
  month,
  canEdit,
  people,
  request,
  reload,
  addSignal,
  consumeAdd,
}) {
  const [editing, setEditing] = useState(null);
  const [image, setImage] = useState(null);
  useEffect(() => {
    if (addSignal) {
      setEditing({});
      consumeAdd();
    }
  }, [addSignal]);
  const recentIds = [
    ...new Set(
      data.field
        .slice()
        .reverse()
        .map((item) => item.leaderId)
        .filter(Boolean),
    ),
  ];
  return (
    <>
      {!data.field.length && <p className="service-empty">這個月還沒有安排。</p>}
      <div className="service-field-list">
        {data.field.map((meeting) => {
          const [year, m, d] = meeting.date.split('-').map(Number);
          const weekday = '日一二三四五六'[new Date(year, m - 1, d).getDay()];
          return (
            <article
              key={`meeting-${meeting.id}`}
              className={`service-field-card ${canEdit ? 'is-editable' : ''}`}
              onClick={() => canEdit && setEditing(meeting)}
            >
              <div
                className="service-field-content"
                role={canEdit ? 'button' : undefined}
                tabIndex={canEdit ? 0 : undefined}
                onKeyDown={(e) => {
                  if (canEdit && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setEditing(meeting);
                  }
                }}
              >
                <div className="service-field-date">
                  {m}/{d}（{weekday}）{meeting.time}
                </div>
                <strong>{meeting.place}</strong>
                <div>{meeting.leaderName || '尚未安排帶頭的人'}</div>
                {meeting.territory && <div>區域：{meeting.territory}</div>}
                {meeting.note && <div className="service-field-note">{meeting.note}</div>}
              </div>
              {meeting.images?.length > 0 && (
                <div className="service-images">
                  {meeting.images.map((item) => (
                    <button
                      className="service-thumb"
                      key={`thumbnail-${item.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setImage(item.url);
                      }}
                      aria-label="放大區域圖片"
                    >
                      <img src={item.url} alt="區域圖片" />
                    </button>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {editing && (
        <FieldEditor
          meeting={editing.id ? editing : null}
          recentIds={recentIds}
          month={month}
          people={people}
          request={request}
          reload={reload}
          close={() => setEditing(null)}
        />
      )}
      {image && (
        <Sheet title="區域圖片" close={() => setImage(null)}>
          <div className="service-image-viewer">
            <img src={image} alt="區域圖片" />
          </div>
        </Sheet>
      )}
    </>
  );
}
