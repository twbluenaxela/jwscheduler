import { authorize, db, failure, bad, missing } from '../../_shared';
export const dynamic = 'force-dynamic';
export async function PATCH(request, context) {
  try {
    const user = await authorize(request, true);
    const id = Number((await context.params).id);
    if (!(await db.serviceCategory.findFirst({ where: { id, congregationId: user.congregationId } })))
      missing();
    const input = await request.json();
    const data = {};
    for (const key of ['name', 'notes', 'positions', 'active', 'sortOrder'])
      if (key in input) data[key] = input[key];
    if (
      ('name' in data && (typeof data.name !== 'string' || !data.name.trim())) ||
      ('notes' in data && data.notes !== null && typeof data.notes !== 'string') ||
      ('active' in data && typeof data.active !== 'boolean') ||
      ('sortOrder' in data && !Number.isInteger(data.sortOrder)) ||
      ('positions' in data &&
        (!Array.isArray(data.positions) ||
          data.positions.some((p) => typeof p !== 'string' || !p.trim()) ||
          new Set(data.positions).size !== data.positions.length))
    )
      bad();
    return Response.json({ category: await db.serviceCategory.update({ where: { id }, data }) });
  } catch (error) {
    return failure(error);
  }
}
