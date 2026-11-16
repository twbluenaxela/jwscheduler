import { authorize, db, failure, bad, missing, validDate, checkPerson } from '../_shared';
export const dynamic = 'force-dynamic';
export async function PUT(request) {
  try {
    const user = await authorize(request, true);
    const { categoryId, date, position, personId = null, text = null } = await request.json();
    if (
      !Number.isInteger(categoryId) ||
      !validDate(date) ||
      typeof position !== 'string' ||
      (text !== null && typeof text !== 'string')
    )
      bad();
    const category = await db.serviceCategory.findFirst({
      where: { id: categoryId, congregationId: user.congregationId },
    });
    if (!category) missing();
    if (
      category.kind === 'field' ||
      (category.kind === 'slots' && !category.positions.includes(position)) ||
      (category.kind === 'groups' && (position !== '小組' || !date.endsWith('-01')))
    )
      bad();
    await checkPerson(personId, user.congregationId);
    const where = { categoryId_date_position: { categoryId, date, position } };
    if (personId === null && text === null) {
      await db.serviceAssignment.deleteMany({
        where: { categoryId, date, position, congregationId: user.congregationId },
      });
      return Response.json({ assignment: null });
    }
    const assignment = await db.serviceAssignment.upsert({
      where,
      create: { congregationId: user.congregationId, categoryId, date, position, personId, text },
      update: { personId, text },
    });
    return Response.json({ assignment });
  } catch (error) {
    return failure(error);
  }
}
