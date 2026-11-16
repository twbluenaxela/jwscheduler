import { dbErrorResponse } from './apiErrors.mjs';
import { verifyIdToken } from './firebase-admin';
import db from './db';
import { canLiterature } from './roles.mjs';

export async function auth(request) {
  const decoded = await verifyIdToken(request);
  const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.congregationId) throw Object.assign(new Error('未加入會眾'), { status: 400 });
  if (!canLiterature(user)) throw Object.assign(new Error('需要書刊權限'), { status: 403 });
  return user.congregationId;
}
export function fail(error) {
  if (error.code === 'P2002') return Response.json({ error: '資料已存在' }, { status: 409 });
  return dbErrorResponse(error, error.status || 500);
}
export function invalid(message = '輸入資料無效') { throw Object.assign(new Error(message), { status: 400 }); }
export function id(value) {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1) invalid();
  return Number(value);
}
export function quantity(value) { if (!Number.isInteger(value) || value < 1 || value > 2147483647) invalid('數量無效'); return value; }
export function note(value) { if (value != null && typeof value !== 'string') invalid(); return value?.trim() || null; }
export function mapped(value) {
  if (Array.isArray(value)) return value.map(mapped);
  if (!value || typeof value !== 'object' || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, (key === 'id' || key.endsWith('Id')) && v != null ? String(v) : mapped(v)]));
}
export async function scoped(model, itemId, congregationId) {
  const result = await db[model].findFirst({ where: { id: id(itemId), congregationId } });
  if (!result) throw Object.assign(new Error('找不到資料'), { status: 404 });
  return result;
}
export const statuses = ['pending', 'ordered', 'received', 'delivered', 'cancelled'];
export function status(value) { if (!statuses.includes(value)) invalid('狀態無效'); return value; }
