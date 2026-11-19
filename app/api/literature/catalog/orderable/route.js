export const dynamic = 'force-dynamic';
import db from '../../../../lib/db';
import { auth, fail, invalid, mapped } from '../../../../lib/literatureApi';
import { parseHubList, planOrderableSync, newPublicationFor } from '../../../../lib/hubOrderable.mjs';

const MAX_TEXT = 200 * 1024;

function counts(plan, added) {
  return {
    add: added ?? plan.add.length,
    open: plan.open.length,
    close: plan.close.length,
    specialOn: plan.specialOn.length,
    specialOff: plan.specialOff.length,
  };
}

export async function POST(request) {
  try {
    const congregationId = await auth(request);
    const body = await request.json().catch(() => null);
    const text = body?.text;
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) invalid('請貼上 Hub 清單');

    const parsed = parseHubList(text);
    if (!parsed.items.length) {
      return Response.json({ error: '找不到任何書刊代碼，請確認貼上的是 Hub 書刊清單' }, { status: 400 });
    }
    const publications = await db.publication.findMany({ where: { congregationId } });
    const plan = planOrderableSync(publications, parsed);

    if (!body.apply) {
      const view = (p) => ({ id: p.id ?? null, code: p.code, name: p.name, format: p.format, specialOrder: Boolean(p.specialOrder) });
      return Response.json(mapped({
        sections: [...parsed.sections],
        plan: {
          add: plan.add.map((item) => ({ ...view(item), section: item.section })),
          open: plan.open.map(view),
          close: plan.close.map(view),
          specialOn: plan.specialOn.map(view),
          specialOff: plan.specialOff.map(view),
        },
        counts: counts(plan),
      }));
    }

    const added = await db.$transaction(async (tx) => {
      for (const p of plan.open) await tx.publication.update({ where: { id: p.id }, data: { orderable: true } });
      for (const p of plan.close) await tx.publication.update({ where: { id: p.id }, data: { orderable: false } });
      for (const p of plan.specialOn) await tx.publication.update({ where: { id: p.id }, data: { specialOrder: true } });
      for (const p of plan.specialOff) await tx.publication.update({ where: { id: p.id }, data: { specialOrder: false } });
      if (!body.addMissing || !plan.add.length) return 0;
      const result = await tx.publication.createMany({
        data: plan.add.map((item) => ({ ...newPublicationFor(item), congregationId })),
        skipDuplicates: true,
      });
      return result.count;
    });
    return Response.json(mapped({ applied: true, counts: counts(plan, added) }));
  } catch (error) {
    return fail(error);
  }
}
