export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import db from '../../../../lib/db';
import { auth, fail, scoped } from '../../../../lib/literatureApi';
export async function DELETE(request, context) {
  try {
    const congregationId = await auth(request);
    const delivery = await scoped('literatureDelivery', (await context.params).id, congregationId);
    await db.$transaction(async tx => {
      await tx.literatureDelivery.delete({ where: { id: delivery.id } });
      if (delivery.requestId && !await tx.literatureDelivery.count({ where: { congregationId, requestId: delivery.requestId } })) await tx.literatureRequest.updateMany({ where: { id: delivery.requestId, congregationId, status: 'delivered' }, data: { status: 'received', deliveredAt: null } });
    }, { timeout: 60000, maxWait: 10000 });
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error); }
}
