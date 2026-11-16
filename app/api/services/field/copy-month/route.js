import { parseIsoDate, toIsoDate } from '../../../../lib/cnDate.mjs';
import { authorize, db, failure, bad, validMonth } from '../../_shared';
export const dynamic = 'force-dynamic';
export async function POST(request) {
  try {
    const user = await authorize(request, true);
    const { from, to } = await request.json();
    if (!validMonth(from) || !validMonth(to) || from === to) bad('月份格式錯誤');
    const source = await db.fieldServiceMeeting.findMany({
      where: { congregationId: user.congregationId, date: { gte: `${from}-01`, lte: `${from}-31` } },
    });
    const first = parseIsoDate(`${to}-01`);
    const data = [];
    for (const meeting of source) {
      const date = parseIsoDate(meeting.date);
      const day = 1 + ((date.getDay() - first.getDay() + 7) % 7) + 7 * Math.floor((date.getDate() - 1) / 7);
      const target = new Date(first.getFullYear(), first.getMonth(), day);
      if (target.getMonth() !== first.getMonth()) continue;
      data.push({
        congregationId: user.congregationId,
        date: toIsoDate(target),
        time: meeting.time,
        place: meeting.place,
        leaderId: meeting.leaderId,
        territory: meeting.territory,
      });
    }
    const result = await db.fieldServiceMeeting.createMany({ data });
    return Response.json({ copied: result.count });
  } catch (error) {
    return failure(error);
  }
}
