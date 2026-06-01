import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

function getAdminAuth() {
  if (!getApps().length) {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(sa) });
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
