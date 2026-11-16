import {
  authorize,
  db,
  failure,
  missing,
  checkPerson,
  fieldPayload,
  fieldInclude,
  mapField,
} from '../../_shared';
export const dynamic = 'force-dynamic';
export async function PATCH(request, context) {
  try {
    const user = await authorize(request, true);
    const id = Number((await context.params).id);
    if (!(await db.fieldServiceMeeting.findFirst({ where: { id, congregationId: user.congregationId } })))
      missing();
    const data = fieldPayload(await request.json(), true);
    await checkPerson(data.leaderId, user.congregationId);
    return Response.json({
      meeting: mapField(await db.fieldServiceMeeting.update({ where: { id }, data, include: fieldInclude })),
    });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request, context) {
  try {
    const user = await authorize(request, true);
    const id = Number((await context.params).id);
    const result = await db.fieldServiceMeeting.deleteMany({
      where: { id, congregationId: user.congregationId },
    });
    if (!result.count) missing();
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
