'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, getToken } from '../lib/auth-context';

const ROLE_LABEL = { SYSADMIN: '系統管理員', ADMIN: '管理員', VIEWER: '檢視者' };

export default function AdminPage() {
  const { firebaseUser, dbUser } = useAuth();
  const router = useRouter();
  const [congregations, setCongregations] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [creating, setCreating] = useState(false);

  // Gate: sysadmin only.
  useEffect(() => {
    if (firebaseUser === undefined || dbUser === null) return;
    if (!firebaseUser) { router.replace('/login'); return; }
    if (dbUser && dbUser.role !== 'SYSADMIN') router.replace('/');
  }, [firebaseUser, dbUser, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/admin/data', { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCongregations(data.congregations);
      setUsers(data.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (dbUser?.role === 'SYSADMIN') load();
  }, [dbUser?.role, load]);

  async function api(path, method, body) {
    const token = await getToken();
    const res = await fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '操作失敗');
    return data;
  }

  async function createCong(e) {
    e.preventDefault();
    setCreating(true);
    setError('');
    try {
      await api('/api/admin/congregations', 'POST', { name: newName, code: newCode });
      setNewName(''); setNewCode('');
      await load();
    } catch (err) { setError(err.message); }
    finally { setCreating(false); }
  }

  async function renameCong(id, current) {
    const name = window.prompt('新的會眾名稱：', current);
    if (name == null || !name.trim()) return;
    try { await api(`/api/admin/congregations/${id}`, 'PATCH', { name: name.trim() }); await load(); }
    catch (err) { window.alert(err.message); }
  }

  async function deleteCong(id, name) {
    if (!window.confirm(`確定刪除「${name}」？所有週次、安排、人員都會一併刪除，成員會被移出會眾。此操作無法復原。`)) return;
    try { await api(`/api/admin/congregations/${id}`, 'DELETE'); await load(); }
    catch (err) { window.alert(err.message); }
  }

  async function updateUser(id, patch) {
    try {
      const { user } = await api(`/api/admin/users/${id}`, 'PATCH', patch);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...user } : u)));
    } catch (err) { window.alert(err.message); }
  }

  async function deleteUser(id, label) {
    if (!window.confirm(`確定刪除帳號「${label}」？此操作會移除其登入權限，無法復原。`)) return;
    try {
      await api(`/api/admin/users/${id}`, 'DELETE');
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (err) { window.alert(err.message); }
  }

  if (dbUser?.role && dbUser.role !== 'SYSADMIN') return null;

  const congName = (id) => congregations.find((c) => c.id === id)?.name ?? '—';

  return (
    <div className="content" style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 18px' }}>
      <div className="toolbar">
        <span className="toolbar__title">系統管理</span>
        <div className="toolbar__spacer" />
        <button className="btn" onClick={() => router.push('/')}>← 返回應用程式</button>
      </div>

      {error && <div className="imp-error" style={{ marginBottom: 12 }}>{error}</div>}
      {loading && <div className="people-empty">載入中…</div>}

      {!loading && (
        <>
          {/* ── Congregations ── */}
          <h3 className="settings-h" style={{ marginTop: 8 }}>會眾（{congregations.length}）</h3>
          <form onSubmit={createCong} className="admin-new-cong">
            <label className="field admin-new-cong__name">
              <span className="field__label">名稱</span>
              <input className="field__input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例：新屋會眾" required />
            </label>
            <label className="field admin-new-cong__code">
              <span className="field__label">代碼</span>
              <input className="field__input field__input--mono" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="xinwu" required />
            </label>
            <button className="btn btn--primary admin-new-cong__btn" disabled={creating}>{creating ? '建立中…' : '＋ 新增會眾'}</button>
          </form>

          <div className="settings-members settings-members--single">
            {congregations.map((c) => (
              <div key={c.id} className="settings-member">
                <div className="settings-member__info">
                  <div className="settings-member__name">{c.name}</div>
                  <div className="settings-member__email">
                    {c.code} · {c._count.users} 帳號 · {c._count.weeks} 週 · {c._count.people} 人員
                  </div>
                </div>
                <button className="btn btn--sm" onClick={() => renameCong(c.id, c.name)}>更名</button>
                <button className="btn btn--danger btn--sm" onClick={() => deleteCong(c.id, c.name)}>刪除</button>
              </div>
            ))}
          </div>

          {/* ── Accounts ── */}
          <h3 className="settings-h" style={{ marginTop: 28 }}>帳號（{users.length}）</h3>
          <div className="settings-members settings-members--single">
            {users.map((u) => (
              <div key={u.id} className="settings-member">
                <div className="settings-member__avatar">{(u.displayName || u.email)?.[0]?.toUpperCase()}</div>
                <div className="settings-member__info">
                  <div className="settings-member__name">{u.displayName || u.email}</div>
                  <div className="settings-member__email">{u.email} · {congName(u.congregationId)}</div>
                </div>
                <select
                  className="settings-role-select"
                  value={u.role}
                  onChange={(e) => updateUser(u.id, { role: e.target.value })}
                  aria-label={`${u.email} 的角色`}
                >
                  {Object.entries(ROLE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select
                  className="settings-role-select"
                  value={u.congregationId ?? ''}
                  onChange={(e) => updateUser(u.id, { congregationId: e.target.value === '' ? null : Number(e.target.value) })}
                  aria-label={`${u.email} 的會眾`}
                >
                  <option value="">（無會眾）</option>
                  {congregations.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {u.id !== dbUser?.id && (
                  <button className="btn btn--danger btn--sm" onClick={() => deleteUser(u.id, u.displayName || u.email)}>刪除</button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
