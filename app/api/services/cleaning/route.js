import { authorize, db, failure, bad } from '../_shared';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  try {
    const user = await authorize(request);
    const year = new URL(request.url).searchParams.get('year');
    if (!/^\d{4}$/.test(year || '')) bad('年份格式錯誤');
    const assignments = await db.serviceAssignment.findMany({
      where: {
        congregationId: user.congregationId,
        date: { gte: `${year}-01-01`, lte: `${year}-12-31` },
        category: { kind: 'groups' },
      },
    });
    return Response.json({
      year,
      months: Array.from({ length: 12 }, (_, i) => {
        const month = `${year}-${String(i + 1).padStart(2, '0')}`;
        return { month, assignments: assignments.filter((item) => item.date.startsWith(month)) };
      }),
    });
  } catch (error) {
    return failure(error);
  }
}
