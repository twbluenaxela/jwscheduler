import { NextResponse } from 'next/server';
import db from './db';
import { auth, fail, scoped } from './literatureApi';

export async function setFormArchived(request, context, archive) {
  try {
    const congregationId = await auth(request);
    const existing = await scoped('literatureFormSubmission', (await context.params).id, congregationId);
    await db.$transaction(
      async (tx) => {
        const row = await tx.literatureFormSubmission.findFirst({ where: { id: existing.id, congregationId } });
        if (Boolean(row.archivedAt) === archive) return;
        for (const item of row.items) {
          if (item.kind === 'once' && item.requestId) {
            await tx.literatureRequest.updateMany({
              where: { id: item.requestId, congregationId, status: archive ? { not: 'delivered' } : 'cancelled' },
              data: { status: archive ? 'cancelled' : 'pending', deliveredAt: null },
            });
          } else if (item.kind === 'standing' && row.personId) {
            const unique = { personId: row.personId, series: item.series, language: item.language };
            if (archive && !item.previous) {
              await tx.literatureSubscription.updateMany({
                where: { congregationId, ...unique },
                data: { active: false },
              });
            } else {
              const data = archive ? item.previous : { quantity: item.quantity, active: true };
              await tx.literatureSubscription.upsert({
                where: { personId_series_language: unique },
                create: { congregationId, ...unique, ...data },
                update: data,
              });
            }
          }
        }
        await tx.literatureFormSubmission.update({
          where: { id: row.id },
          data: { archivedAt: archive ? new Date() : null },
        });
      },
      { timeout: 60000, maxWait: 10000 },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
