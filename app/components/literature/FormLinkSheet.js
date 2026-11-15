'use client';
import { useEffect, useState } from 'react';
import { Sheet } from './PubThumb';

function SubmissionRow({ row, archived, archive }) {
  const time = new Date(row.createdAt).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Taipei',
  });
  const summary = row.items
    .map((item) => `${item.name} ×${item.quantity}${item.kind === 'standing' ? ' 定期' : ''}`)
    .join(' · ');
  return (
    <div className="public-submission">
      <strong>
        {row.personName} {!row.personId && <small className="lit-badge">名單外</small>}
      </strong>
      <small>{time}</small>
      <span>{summary}</span>
      {row.flagged && (
        <span className="public-flag">
          <span className="public-flag-dot" aria-hidden="true" />
          需留意：{row.reason}
        </span>
      )}
      <button className="btn btn--sm" onClick={() => archive(row, archived)}>
        {archived ? '復原' : '封存'}
      </button>
    </div>
  );
}

function LinkControls({ url, copied, copy, link }) {
  if (!url) {
    return (
      <>
        <p>開啟後，大家不用登入就能用連結申請書刊。</p>
        <button className="btn btn--primary" onClick={() => link('POST')}>
          開啟申請連結
        </button>
      </>
    );
  }
  return (
    <>
      <label className="field">
        <span className="field__label">申請連結</span>
        <input className="field__input" readOnly value={url} />
      </label>
      <div className="public-link-actions">
        <button className="btn" onClick={copy}>
          {copied ? '已複製' : '複製'}
        </button>
        {typeof navigator !== 'undefined' && navigator.share && (
          <button className="btn" onClick={() => navigator.share({ title: '書刊申請', url }).catch(() => {})}>
            分享
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            if (window.confirm('舊連結會立刻失效，確定？')) link('POST');
          }}
        >
          重新產生
        </button>
        <button className="btn btn--danger" onClick={() => link('DELETE')}>
          關閉連結
        </button>
      </div>
    </>
  );
}

export default function FormLinkSheet({ request, close }) {
  const [url, setUrl] = useState('');
  const [rows, setRows] = useState([]);
  const [archived, setArchived] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [snack, setSnack] = useState(null);

  async function loadRows(value) {
    try {
      const data = await request(`/api/literature/form-submissions?archived=${value ? 1 : 0}`);
      setRows(data.submissions);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => {
    request('/api/literature')
      .then((data) => setUrl(data.formUrl || ''))
      .catch((e) => setError(e.message));
  }, [request]);
  useEffect(() => {
    loadRows(archived);
  }, [archived]);
  useEffect(() => {
    if (snack) {
      const timer = setTimeout(() => setSnack(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [snack]);

  async function link(method) {
    try {
      const data = await request('/api/literature/form-link', { method });
      setUrl(data.url || '');
    } catch (e) {
      setError(e.message);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      setError(e.message);
    }
  }
  async function archive(row, undo = false) {
    try {
      await request(`/api/literature/form-submissions/${row.id}/${undo ? 'unarchive' : 'archive'}`, { method: 'POST' });
      await loadRows(archived);
      if (!undo) setSnack(row);
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <Sheet title="申請連結" close={close}>
      <div className="lit-form">
        <LinkControls url={url} copied={copied} copy={copy} link={link} />
        <h3>最近表單申請</h3>
        <label>
          <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> 顯示已封存
        </label>
        {!rows.length && <p>沒有申請紀錄。</p>}
        {rows.map((row) => (
          <SubmissionRow key={row.id} row={row} archived={archived} archive={archive} />
        ))}
        {error && (
          <p className="imp-error" role="alert">
            {error}
          </p>
        )}
        {snack && (
          <div className="lit-handout-snack" role="status">
            已封存
            <button
              onClick={() => {
                archive(snack, true);
                setSnack(null);
              }}
            >
              復原
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
