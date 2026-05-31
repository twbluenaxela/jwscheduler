'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, getToken } from '../../lib/auth-context';

export default function JoinPage() {
  const { token } = useParams();
  const { firebaseUser, dbUser, setDbUser } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState('loading'); // loading | joining | done | error
  const [error, setError] = useState('');

  useEffect(() => {
    if (firebaseUser === undefined) return; // still loading auth

    if (!firebaseUser) {
      // Not logged in — redirect to login with token in query
      router.replace(`/login?invite=${token}`);
      return;
    }

    if (dbUser === null) return; // waiting for db sync

    if (dbUser?.congregationId) {
      // Already in a congregation
      router.replace('/');
      return;
    }

    joinCongregation();
  }, [firebaseUser, dbUser]);

  async function joinCongregation() {
    setStatus('joining');
    try {
      const idToken = await getToken();
      const res = await fetch('/api/congregations/join', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken: token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDbUser(data.user);
      setStatus('done');
      setTimeout(() => router.replace('/'), 1500);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }

  return (
    <div className="login-shell">
      <div className="login-card" style={{ textAlign: 'center', gap: 16 }}>
        <div className="login-brand__icon" style={{ fontSize: 40 }}>📅</div>
        {status === 'loading' || status === 'joining' ? (
          <>
            <div className="login-brand__title">正在加入會眾…</div>
            <div className="login-brand__sub">請稍候</div>
          </>
        ) : status === 'done' ? (
          <>
            <div style={{ fontSize: 36 }}>✓</div>
            <div className="login-brand__title">加入成功！</div>
            <div className="login-brand__sub">正在跳轉…</div>
          </>
        ) : (
          <>
            <div className="login-brand__title">加入失敗</div>
            <div className="login-error">{error}</div>
            <button className="btn" onClick={() => router.replace('/')}>返回首頁</button>
          </>
        )}
      </div>
    </div>
  );
}
