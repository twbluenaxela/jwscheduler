'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, getRedirectResult } from 'firebase/auth';
import { auth } from './firebase-client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = still loading, null = logged out, object = logged in
  const [firebaseUser, setFirebaseUser] = useState(undefined);
  const [dbUser, setDbUser] = useState(null);
  // true while /api/auth/sync is in-flight after a Firebase login
  const [dbSyncing, setDbSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);

  useEffect(() => {
    getRedirectResult(auth).catch((err) => {
      console.error('[auth] getRedirectResult error:', err.code, err.message);
    });

    return onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) {
        setDbUser(null);
        setSyncError(null);
        return;
      }

      setDbSyncing(true);
      setSyncError(null);
      try {
        const token = await fbUser.getIdToken();
        const res = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: fbUser.email, displayName: fbUser.displayName }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `sync failed (${res.status})`);
        setDbUser(data.user ?? null);
      } catch (err) {
        console.error('[auth/sync] error:', err.message);
        setSyncError(err.message);
        setDbUser(null);
      } finally {
        setDbSyncing(false);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ firebaseUser, dbUser, setDbUser, dbSyncing, syncError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Helper: get current user's Firebase ID token for API calls
export async function getToken() {
  const { currentUser } = auth;
  if (!currentUser) throw new Error('Not logged in');
  return currentUser.getIdToken();
}
