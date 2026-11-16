import { authorize, db, failure, checkPerson, fieldPayload, fieldInclude, mapField } from '../_shared';
export const dynamic = 'force-dynamic';
export async function POST(request) {
  try {
    const user = await authorize(request, true);
    const data = fieldPayload(await request.json());
    await checkPerson(data.leaderId, user.congregationId);
    const meeting = await db.fieldServiceMeeting.create({
      data: { ...data, congregationId: user.congregationId },
      include: fieldInclude,
    });
    return Response.json({ meeting: mapField(meeting) });
  } catch (error) {
    return failure(error);
  }
}
