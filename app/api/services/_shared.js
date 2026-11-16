import { verifyIdToken } from '../../lib/firebase-admin';
import db from '../../lib/db';
import { canEdit } from '../../lib/roles.mjs';
import { parseIsoDate, toIsoDate } from '../../lib/cnDate.mjs';

export { db };
export async function authorize(request, write = false) {
  const decoded = await verifyIdToken(request);
  const user = await db.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (!user?.congregationId) throw Object.assign(new Error('未加入會眾'), { status: 400 });
  if (write && !canEdit(user.role)) throw Object.assign(new Error('需要編輯權限'), { status: 403 });
  return user;
}
export function failure(error) {
  return error.status
    ? Response.json({ error: error.message }, { status: error.status })
    : dbErrorResponse(error);
}
import { dbErrorResponse } from '../../lib/apiErrors.mjs';
export function bad(message = '資料格式錯誤') {
  throw Object.assign(new Error(message), { status: 400 });
}
export function missing() {
  throw Object.assign(new Error('找不到資料'), { status: 404 });
}
export function validDate(date) {
  return typeof date === 'string' && toIsoDate(parseIsoDate(date)) === date;
}
export function validMonth(month) {
  return typeof month === 'string' && validDate(`${month}-01`);
}
export async function checkPerson(id, congregationId) {
  if (
    id != null &&
    (!Number.isInteger(id) || !(await db.person.findFirst({ where: { id, congregationId } })))
  )
    bad('找不到會眾成員');
}
export function fieldPayload(data, partial = false) {
  const out = {};
  for (const key of ['date', 'time', 'place', 'leaderId', 'territory', 'note'])
    if (key in data) out[key] = data[key];
  if ((!partial || 'date' in out) && !validDate(out.date)) bad('日期格式錯誤');
  if (
    (!partial || 'time' in out) &&
    (typeof out.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(out.time))
  )
    bad('時間格式錯誤');
  if ((!partial || 'place' in out) && (typeof out.place !== 'string' || !out.place.trim())) bad('請輸入地點');
  for (const key of ['territory', 'note']) if (out[key] != null && typeof out[key] !== 'string') bad();
  return out;
}
export function mapField(meeting) {
  const { leader, images, ...rest } = meeting;
  return {
    ...rest,
    leaderName: leader?.name ?? null,
    images: (images || []).map((image) => ({
      id: image.id,
      url: `/api/services/field/images/${image.token}`,
    })),
  };
}
export const fieldInclude = {
  leader: { select: { name: true } },
  images: { select: { id: true, token: true } },
};
