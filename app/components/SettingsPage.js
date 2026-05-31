'use client';
import { useState, useEffect } from 'react';
import { useAuth, getToken } from '../lib/auth-context';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase-client';

const DAY_SHORT = ['一','二','三','四','五','六','日'];
const DAY_NAMES = ['星期一','星期二','星期三','星期四','星期五','星期六','星期日'];

function addException(list, defaults) {
  return [...list, { id: Date.now(), fromMonth: 1, fromDay: 1, toMonth: 12, toDay: 31, dayOffset: defaults.dayOffset, time: defaults.time }];
}

export default function SettingsPage({ congSettings, setCongSettings, onReapplySchedule, existingWeeks = [] }) {
  const { dbUser, setDbUser } = useAuth();
  const [cong, setCong] = useState(null);
  const [members, setMembers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [nameEdit, setNameEdit] = useState('');

  const isAdmin = dbUser?.role === 'ADMIN';

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const token = await getToken();
      const res = await fetch('/api/congregations/settings', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const { congregation } = await res.json();
        setCong(congregation);
        setMembers(congregation.users ?? []);
        setNameEdit(congregation.name ?? '');
        // Sync congSettings from DB
        setCongSettings({
          dayOffset: congregation.meetingDayOffset ?? 2,
          time: congregation.meetingTime ?? '19:30',
          exceptions: congregation.exceptions ?? [],
        });
      }
    } catch {}
  }

  async function saveSchedule() {
    setSaving(true);
    try {
      const token = await getToken();
      await fetch('/api/congregations/settings', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameEdit,
          meetingDayOffset: congSettings.dayOffset,
          meetingTime: congSettings.time,
          exceptions: congSettings.exceptions ?? [],
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  const inviteUrl = cong ? `${window.location.origin}/join/${cong.inviteToken}` : '';

  function copyInvite() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section>
      <div className="toolbar">
        <span className="toolbar__title">設定</span>
        <button className="btn" onClick={() => signOut(auth)}>登出</button>
      </div>

      {/* ── Congregation info ── */}
      <div className="settings-grid">
        <div className="settings-section">
          <h3 className="settings-h">會眾資訊</h3>
          <div className="settings-card">
            <div className="settings-row">
              <span className="settings-row__label">會眾名稱</span>
              {isAdmin
                ? <input className="settings-input" value={nameEdit} onChange={e => setNameEdit(e.target.value)} />
                : <span className="settings-row__val">{cong?.name}</span>}
            </div>
            <div className="settings-row">
              <span className="settings-row__label">會眾代碼</span>
              <span className="settings-row__val settings-row__val--mono">{cong?.code}</span>
            </div>
            <div className="settings-row">
              <span className="settings-row__label">你的身份</span>
              <span className={`settings-badge ${dbUser?.role === 'ADMIN' ? 'settings-badge--admin' : ''}`}>
                {dbUser?.role === 'ADMIN' ? '管理員' : '成員'}
              </span>
            </div>
          </div>

          {/* Invite link */}
          <h3 className="settings-h" style={{ marginTop: 20 }}>邀請連結</h3>
          <div className="settings-card settings-invite">
            <div className="settings-invite__url">{inviteUrl || '載入中…'}</div>
            <button className="btn btn--primary" onClick={copyInvite} disabled={!inviteUrl}>
              {copied ? '已複製！' : '複製連結'}
            </button>
          </div>
          <p className="settings-hint">任何人點擊連結並登入即可加入此會眾。</p>
        </div>

        {/* ── Meeting schedule ── */}
        <div className="settings-section">
          <h3 className="settings-h">聚會排程設定</h3>
          <div className="settings-card">
            <div className="cong-settings__label">預設平日聚會</div>
            <div className="cong-settings__row" style={{ marginTop: 8 }}>
              <div className="cong-settings__days">
                {DAY_SHORT.map((d, i) => (
                  <button key={i}
                    className={`cong-day-btn${congSettings.dayOffset === i ? ' is-active' : ''}`}
                    onClick={() => setCongSettings(s => ({ ...s, dayOffset: i }))}>
                    {d}
                  </button>
                ))}
              </div>
              <input className="cong-settings__time" type="time"
                value={congSettings.time}
                onChange={e => setCongSettings(s => ({ ...s, time: e.target.value }))} />
            </div>

            {(congSettings.exceptions ?? []).length > 0 && (
              <div className="cong-exc-list" style={{ marginTop: 12 }}>
                {congSettings.exceptions.map(exc => (
                  <div key={exc.id} className="cong-exc">
                    <span className="cong-exc__label">從</span>
                    <input className="cong-exc__num" type="number" min="1" max="12" value={exc.fromMonth}
                      onChange={e => setCongSettings(s => ({ ...s, exceptions: s.exceptions.map(x => x.id === exc.id ? { ...x, fromMonth: +e.target.value } : x) }))} />
                    <span className="cong-exc__label">月</span>
                    <input className="cong-exc__num" type="number" min="1" max="31" value={exc.fromDay}
                      onChange={e => setCongSettings(s => ({ ...s, exceptions: s.exceptions.map(x => x.id === exc.id ? { ...x, fromDay: +e.target.value } : x) }))} />
                    <span className="cong-exc__label">日 至</span>
                    <input className="cong-exc__num" type="number" min="1" max="12" value={exc.toMonth}
                      onChange={e => setCongSettings(s => ({ ...s, exceptions: s.exceptions.map(x => x.id === exc.id ? { ...x, toMonth: +e.target.value } : x) }))} />
                    <span className="cong-exc__label">月</span>
                    <input className="cong-exc__num" type="number" min="1" max="31" value={exc.toDay}
                      onChange={e => setCongSettings(s => ({ ...s, exceptions: s.exceptions.map(x => x.id === exc.id ? { ...x, toDay: +e.target.value } : x) }))} />
                    <span className="cong-exc__label">改為</span>
                    <div className="cong-settings__days">
                      {DAY_SHORT.map((d, i) => (
                        <button key={i}
                          className={`cong-day-btn cong-day-btn--sm${exc.dayOffset === i ? ' is-active' : ''}`}
                          onClick={() => setCongSettings(s => ({ ...s, exceptions: s.exceptions.map(x => x.id === exc.id ? { ...x, dayOffset: i } : x) }))}>
                          {d}
                        </button>
                      ))}
                    </div>
                    <input className="cong-settings__time" type="time" value={exc.time}
                      onChange={e => setCongSettings(s => ({ ...s, exceptions: s.exceptions.map(x => x.id === exc.id ? { ...x, time: e.target.value } : x) }))} />
                    <button className="cong-exc__del"
                      onClick={() => setCongSettings(s => ({ ...s, exceptions: s.exceptions.filter(x => x.id !== exc.id) }))}>✕</button>
                  </div>
                ))}
              </div>
            )}

            <div className="cong-settings__actions" style={{ marginTop: 12 }}>
              <button className="btn btn--ghost"
                onClick={() => setCongSettings(s => ({ ...s, exceptions: addException(s.exceptions ?? [], s) }))}>
                + 新增例外期間
              </button>
              {existingWeeks.some(w => w.weekStart) && (
                <button className="btn btn--ghost" onClick={onReapplySchedule}>
                  重新套用至所有週次
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button className="btn btn--primary" onClick={saveSchedule} disabled={saving}>
              {saving ? '儲存中…' : '儲存設定'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Members ── */}
      <h3 className="settings-h" style={{ marginTop: 28 }}>成員列表</h3>
      <div className="settings-members">
        {members.map(m => (
          <div key={m.id} className="settings-member">
            <div className="settings-member__avatar">{(m.displayName || m.email)?.[0]?.toUpperCase()}</div>
            <div className="settings-member__info">
              <div className="settings-member__name">{m.displayName || m.email}</div>
              <div className="settings-member__email">{m.displayName ? m.email : ''}</div>
            </div>
            <span className={`settings-badge ${m.role === 'ADMIN' ? 'settings-badge--admin' : ''}`}>
              {m.role === 'ADMIN' ? '管理員' : '成員'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
