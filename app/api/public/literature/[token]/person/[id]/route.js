export const dynamic = 'force-dynamic';
import db from '../../../../../../lib/db';
import { publicCongregation, publicJson, disabled } from '../../../../../../lib/publicLiteratureApi';

export async function GET(request, context) {
  const congregation = await publicCongregation(context);
  if (!congregation) return disabled();
  const value = (await context.params).id;
  const personId = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(personId) || personId < 1) return publicJson({ error: '找不到成員' }, 404);
  const person = await db.person.findFirst({ where: { id: personId, congregationId: congregation.id, status: { not: 'inactive' } } });
  if (!person) return publicJson({ error: '找不到成員' }, 404);
  const subscriptions = await db.literatureSubscription.findMany({ where: { congregationId: congregation.id, personId, active: true }, select: { series: true, language: true, quantity: true } });
  return publicJson({ subscriptions });
}
