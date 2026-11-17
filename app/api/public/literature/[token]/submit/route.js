export const dynamic = 'force-dynamic';
import db from '../../../../../lib/db';
import { publicCongregation, publicJson, disabled } from '../../../../../lib/publicLiteratureApi';
import { validateSubmission, flagSubmission, localizedName } from '../../../../../lib/publicForm.mjs';
import { standingSeriesOf } from '../../../../../lib/literatureShipments.mjs';

const attempts = new Map();
const windowMs = 10 * 60 * 1000;

export async function POST(request, context) {
  const congregation = await publicCongregation(context);
  if (!congregation) return disabled();
  const { token } = await context.params;
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('fly-client-ip') || 'unknown';
  const now = Date.now();
  for (const [key, timestamps] of attempts) if (!timestamps.some((time) => time > now - windowMs)) attempts.delete(key);
  const key = `${ip}:${token}`;
  const timestamps = (attempts.get(key) || []).filter((time) => time > now - windowMs);
  if (timestamps.length >= 10) return publicJson({ error: '送出太多次了，請稍後再試。' }, 429);
  timestamps.push(now);
  attempts.set(key, timestamps);
  let normalized;
  let publications;
  try {
    const body = await request.json();
    const [people, catalog] = await Promise.all([
      db.person.findMany({ where: { congregationId: congregation.id } }),
      db.publication.findMany({ where: { congregationId: congregation.id } }),
    ]);
    publications = catalog;
    normalized = validateSubmission({ body, people, publications, guest: body.guest });
  } catch (error) {
    return publicJson({ error: error instanceof SyntaxError ? '輸入資料無效' : error.message }, 400);
  }
  try {
    const submission = await db.$transaction(
      async (tx) => {
        const items = [];
        const previousSubs = [];
        for (const item of normalized.items) {
          const pub = publications.find((p) => p.id === item.publicationId);
          const entry = { ...item, code: pub.code, name: localizedName(pub, publications) };
          if (item.kind === 'once') {
            const row = await tx.literatureRequest.create({
              data: {
                congregationId: congregation.id,
                personId: normalized.personId,
                guestName: normalized.guestName,
                guestNote: normalized.guestNote,
                publicationId: pub.id,
                quantity: item.quantity,
                status: 'pending',
                source: 'form',
              },
            });
            entry.requestId = row.id;
          } else {
            const series = standingSeriesOf(pub.code),
              language = pub.language;
            const unique = { personId: normalized.personId, series, language };
            const existing = await tx.literatureSubscription.findUnique({
              where: { personId_series_language: unique },
            });
            if (existing) previousSubs.push(existing);
            entry.series = series;
            entry.language = language;
            entry.previous = existing ? { quantity: existing.quantity, active: existing.active } : null;
            await tx.literatureSubscription.upsert({
              where: { personId_series_language: unique },
              create: { congregationId: congregation.id, ...unique, quantity: item.quantity, active: true },
              update: { quantity: item.quantity, active: true },
            });
          }
          items.push(entry);
        }
        const recentCount = await tx.literatureFormSubmission.count({
          where: {
            congregationId: congregation.id,
            ...(normalized.personId
              ? { personId: normalized.personId }
              : { personId: null, guestName: normalized.guestName }),
            createdAt: { gte: new Date(Date.now() - windowMs) },
          },
        });
        const flags = flagSubmission({ items, previousSubs, recentCount, guest: !normalized.personId });
        return tx.literatureFormSubmission.create({
          data: {
            congregationId: congregation.id,
            personId: normalized.personId,
            guestName: normalized.guestName,
            guestNote: normalized.guestNote,
            note: normalized.note,
            items,
            ...flags,
          },
        });
      },
      { timeout: 60000, maxWait: 10000 },
    );
    return publicJson({ ok: true, submissionId: String(submission.id) });
  } catch (error) {
    return publicJson({ error: '送出失敗，請稍後再試。' }, 500);
  }
}
