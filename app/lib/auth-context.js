'use client';
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase-client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = still loading, null = logged out, object = logged in
  const [firebaseUser, setFirebaseUser] = useState(undefined);
  const [dbUser, setDbUser] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseUser(fbUser);
      if (!fbUser) { setDbUser(null); return; }

      try {
        const token = await fbUser.getIdToken();
        const res = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: fbUser.email, displayName: fbUser.displayName }),
        });
        const data = await res.json();
        setDbUser(data.user ?? null);
      } catch {
        setDbUser(null);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ firebaseUser, dbUser, setDbUser }}>
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
