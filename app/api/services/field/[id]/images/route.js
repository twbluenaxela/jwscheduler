import { randomBytes } from 'node:crypto';
import { authorize, db, failure, bad, missing } from '../../../_shared';
export const dynamic = 'force-dynamic';
export async function POST(request, context) {
  try {
    const user = await authorize(request, true);
    const meetingId = Number((await context.params).id);
    if (
      !(await db.fieldServiceMeeting.findFirst({
        where: { id: meetingId, congregationId: user.congregationId },
      }))
    )
      missing();
    const contentType = request.headers.get('content-type') || '';
    let mime, data;
    if (contentType.startsWith('multipart/form-data')) {
      const form = await request.formData();
      const file = form.get('file') || form.get('image');
      if (!file || typeof file.arrayBuffer !== 'function') bad('請選擇圖片');
      mime = file.type;
      data = Buffer.from(await file.arrayBuffer());
    } else {
      mime = contentType.split(';')[0];
      data = Buffer.from(await request.arrayBuffer());
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime) || !data.length) bad('不支援的圖片格式');
    if (data.length > 400 * 1024) return Response.json({ error: '圖片不得超過 400 KB' }, { status: 413 });
    const image = await db.fieldServiceImage.create({
      data: { meetingId, mime, data, token: randomBytes(32).toString('base64url') },
      select: { id: true, token: true },
    });
    return Response.json({ image: { id: image.id, url: `/api/services/field/images/${image.token}` } });
  } catch (error) {
    return failure(error);
  }
}
