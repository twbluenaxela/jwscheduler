'use client';
import { useState } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithRedirect,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase-client';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    setError('');
    setLoading(true);
    signInWithRedirect(auth, googleProvider).catch((err) => {
      setError(friendlyError(err.code));
      setLoading(false);
    });
  };

  return (
    <div className="login-shell">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-brand__icon">📅</span>
          <div>
            <div className="login-brand__title">聚會編排系統</div>
            <div className="login-brand__sub">JW Scheduler</div>
          </div>
        </div>

        <div className="login-tabs">
          <button className={`login-tab${mode === 'login' ? ' is-active' : ''}`} onClick={() => setMode('login')}>登入</button>
          <button className={`login-tab${mode === 'register' ? ' is-active' : ''}`} onClick={() => setMode('register')}>註冊</button>
        </div>

        <form onSubmit={handle} className="login-form">
          {mode === 'register' && (
            <div className="login-field">
              <label className="login-label">姓名</label>
              <input className="login-input" type="text" placeholder="你的名字" value={name} onChange={e => setName(e.target.value)} />
            </div>
          )}
          <div className="login-field">
            <label className="login-label">電子郵件</label>
            <input className="login-input" type="email" placeholder="email@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="login-field">
            <label className="login-label">密碼</label>
            <input className="login-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
          </div>

          {error && <div className="login-error">{error}</div>}

          <button className="btn btn--primary login-submit" type="submit" disabled={loading}>
            {loading ? '請稍候…' : mode === 'login' ? '登入' : '建立帳號'}
          </button>
        </form>

        <div className="login-divider"><span>或</span></div>

        <button className="login-google" onClick={handleGoogle} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>
          使用 Google 帳號登入
        </button>
      </div>
    </div>
  );
}

function friendlyError(code) {
  const map = {
    'auth/user-not-found':      '找不到此帳號',
    'auth/wrong-password':      '密碼錯誤',
    'auth/invalid-credential':  '帳號或密碼錯誤',
    'auth/email-already-in-use':'此信箱已被使用',
    'auth/weak-password':       '密碼至少需要 6 個字元',
    'auth/popup-closed-by-user':'視窗已關閉，請重試',
  };
  return map[code] ?? '登入失敗，請再試一次';
}
