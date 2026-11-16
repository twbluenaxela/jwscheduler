import { randomUUID } from 'node:crypto';
import { DEFAULT_CATEGORIES } from '../../lib/services.mjs';
import { authorize, db, failure, bad } from './_shared';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const user = await authorize(request);
    const where = { congregationId: user.congregationId };
    if (!(await db.serviceCategory.count({ where })))
      await db.serviceCategory.createMany({
        data: DEFAULT_CATEGORIES.map((category) => ({ ...category, ...where })),
        skipDuplicates: true,
      });
    return Response.json({
      categories: await db.serviceCategory.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request) {
  try {
    const user = await authorize(request, true);
    const { name, kind, positions } = await request.json();
    if (
      typeof name !== 'string' ||
      !name.trim() ||
      kind !== 'slots' ||
      !Array.isArray(positions) ||
      !positions.length ||
      positions.some((p) => typeof p !== 'string' || !p.trim()) ||
      new Set(positions).size !== positions.length
    )
      bad();
    const category = await db.serviceCategory.create({
      data: { congregationId: user.congregationId, key: randomUUID(), name: name.trim(), kind, positions },
    });
    return Response.json({ category });
  } catch (error) {
    return failure(error);
  }
}
