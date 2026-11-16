import { authorize, db, failure, missing } from '../../../_shared';
export const dynamic = 'force-dynamic';
export async function GET(request, context) {
  try {
    const image = await db.fieldServiceImage.findUnique({ where: { token: (await context.params).token } });
    if (!image) missing();
    return new Response(image.data, {
      headers: { 'Content-Type': image.mime, 'Cache-Control': 'private, max-age=31536000, immutable' },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request, context) {
  try {
    const user = await authorize(request, true);
    const id = Number((await context.params).token);
    const result = await db.fieldServiceImage.deleteMany({
      where: { id, meeting: { congregationId: user.congregationId } },
    });
    if (!result.count) missing();
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
