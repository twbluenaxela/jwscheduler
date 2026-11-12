'use client';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';

export const DRIVE_FOLDER_ID =
  process.env.NEXT_PUBLIC_GOOGLE_DRIVE_FOLDER_ID || '1jTRCmngzNiQj6QQaHqEMgcr0mN0KAEmo';

let gisPromise = null;
function loadGis() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('無法載入 Google 登入元件'));
    document.head.appendChild(s);
  });
  return gisPromise;
}

export async function requestDriveToken() {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('尚未設定 NEXT_PUBLIC_GOOGLE_CLIENT_ID');
  await loadGis();

  return new Promise((resolve, reject) => {
    let consentAttempted = false;
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp?.error) {
          if (!consentAttempted) {
            consentAttempted = true;
            try {
              client.requestAccessToken({ prompt: 'consent' });
            } catch (e) {
              reject(e);
            }
          } else {
            reject(new Error(resp.error_description || resp.error));
          }
        } else if (resp?.access_token) {
          resolve(resp.access_token);
        } else {
          reject(new Error('Google 未回傳 access token'));
        }
      },
      error_callback: (err) => reject(new Error(err?.message || 'Google 授權失敗')),
    });
    try {
      client.requestAccessToken({ prompt: '' });
    } catch (e) {
      reject(e);
    }
  });
}

export async function listFiles(folderId, accessToken) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const url = `${DRIVE_API}/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Drive list error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.files ?? [];
}

export async function upsertFile({ folderId, filename, content, mimeType, accessToken }) {
  const bytes = content instanceof Uint8Array ? content : new Uint8Array(content);
  const existing = (await listFiles(folderId, accessToken)).find((f) => f.name === filename);

  if (existing) {
    const res = await fetch(`${UPLOAD_API}/files/${existing.id}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': mimeType,
      },
      body: bytes,
    });
    if (!res.ok) throw new Error(`Drive update error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return { id: data.id, name: data.name ?? filename, action: 'updated' };
  }

  const boundary = 'jwscheduler_boundary_' + Math.random().toString(36).slice(2);
  const metadata = { name: filename, parents: [folderId] };
  const metaPart = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
  );
  const mediaHeader = new TextEncoder().encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const footer = new TextEncoder().encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(metaPart.length + mediaHeader.length + bytes.length + footer.length);
  let off = 0;
  body.set(metaPart, off); off += metaPart.length;
  body.set(mediaHeader, off); off += mediaHeader.length;
  body.set(bytes, off); off += bytes.length;
  body.set(footer, off);

  const res = await fetch(`${UPLOAD_API}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw new Error(`Drive create error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { id: data.id, name: data.name ?? filename, action: 'created' };
}