export const dynamic = 'force-dynamic';
import db from '../../../../lib/db';
import { publicCongregation, publicJson, disabled } from '../../../../lib/publicLiteratureApi';
import { groupPeople, publicCatalog } from '../../../../lib/publicForm.mjs';

export async function GET(request, context) {
  const congregation = await publicCongregation(context);
  if (!congregation) return disabled();
  const [people, publications] = await Promise.all([
    db.person.findMany({ where: { congregationId: congregation.id } }),
    db.publication.findMany({ where: { congregationId: congregation.id } }),
  ]);
  return publicJson({ congregation: { name: congregation.name }, groups: groupPeople(people), publications: publicCatalog(publications) });
}
