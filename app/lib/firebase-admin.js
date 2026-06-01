import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// Build admin credentials from env. Prefer FIREBASE_SERVICE_ACCOUNT (full JSON
// blob — its \n escapes are decoded by JSON.parse), and fall back to the three
// individual vars. In both cases normalize the private key's newlines so the
// PEM parses regardless of how the secret was stored.
function loadServiceAccount() {
  const blob = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (blob) {
    const sa = JSON.parse(blob);
    if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    return sa;
  }
  return {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };
}

function getAdminAuth() {
  if (!getApps().length) {
    initializeApp({ credential: cert(loadServiceAccount()) });
  }
  return getAuth();
}

// Verify a Firebase ID token from Authorization: Bearer <token>
// Returns the decoded token or throws
export async function verifyIdToken(request) {
  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new Error('Missing auth token');
  return getAdminAuth().verifyIdToken(token);
}
