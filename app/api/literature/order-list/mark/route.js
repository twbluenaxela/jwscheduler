import db from '../../../../lib/db';
import { auth, fail, id, invalid } from '../../../../lib/literatureApi';

export async function POST(request) {
  try {
    const congregationId = await auth(request);
    const body = await request.json();
    if (!Array.isArray(body.requestIds) || !body.requestIds.length || !['pending', 'ordered', 'received'].includes(body.status)) invalid();
    const ids = [...new Set(body.requestIds.map(id))];
    const where = { congregationId, id: { in: ids }, status: body.status === 'pending' ? { in: ['ordered', 'received'] } : 'pending' };
    const changed = await db.literatureRequest.updateManyAndReturn({
      where,
      data: { status: body.status },
      select: { id: true },
    });
    return Response.json({ requestIds: changed.map((row) => String(row.id)) });
  } catch (error) {
    return fail(error);
  }
}
