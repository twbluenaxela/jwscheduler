export const dynamic = 'force-dynamic';
import db from '../../../../lib/db';
import { auth, fail, id, invalid, mapped } from '../../../../lib/literatureApi';

export async function GET(request) {
  try {
    const congregationId = await auth(request);
    const congregation = await db.congregation.findUnique({ where: { id: congregationId } });
    return Response.json(mapped({ personId: congregation.inventoryReminderPersonId }));
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request) {
  try {
    const congregationId = await auth(request);
    const body = await request.json();
    if (!Object.hasOwn(body, 'personId')) invalid();
    const personId = body.personId === null ? null : id(body.personId);
    if (personId !== null) {
      const person = await db.person.findFirst({ where: { id: personId, congregationId } });
      if (!person) invalid('找不到人員');
    }
    await db.congregation.update({
      where: { id: congregationId },
      data: { inventoryReminderPersonId: personId },
    });
    return Response.json(mapped({ personId }));
  } catch (error) {
    return fail(error);
  }
}
