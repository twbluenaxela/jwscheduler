import { meetingDatesInMonth } from '../../../lib/services.mjs';
import { authorize, db, failure, bad, validMonth, mapField, fieldInclude } from '../_shared';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const user = await authorize(request);
    const month = new URL(request.url).searchParams.get('month');
    if (!validMonth(month)) bad('月份格式錯誤');
    const congregationId = user.congregationId;
    const date = { gte: `${month}-01`, lte: `${month}-31` };
    const [weeks, weekendRows, assignments, field] = await Promise.all([
      db.midweekWeek.findMany({ where: { congregationId } }),
      db.weekendRow.findMany({ where: { congregationId } }),
      db.serviceAssignment.findMany({
        where: { congregationId, date },
        include: { person: { select: { name: true } }, category: { select: { kind: true } } },
      }),
      db.fieldServiceMeeting.findMany({
        where: { congregationId, date },
        include: fieldInclude,
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
      }),
    ]);
    const mapped = assignments.map(({ person, category, ...item }) => ({
      ...item,
      personName: person?.name ?? null,
      kind: category.kind,
    }));
    return Response.json({
      month,
      dates: meetingDatesInMonth(month, weeks, weekendRows),
      assignments: mapped.filter((item) => item.kind !== 'groups'),
      cleaning: mapped.filter((item) => item.kind === 'groups'),
      field: field.map(mapField),
    });
  } catch (error) {
    return failure(error);
  }
}
