export const dynamic = 'force-dynamic';
import db from '../../../lib/db';
import { calendarResponse } from '../../../lib/calendarFeed.mjs';
import { publicOrigin } from '../../../lib/publicOrigin.mjs';

export async function GET(request, context) {
  const { token } = await context.params;
  return calendarResponse(db, token, { origin: publicOrigin(request) });
}
