import db from '../../lib/db';
import { dbErrorResponse } from '../../lib/apiErrors.mjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch (error) {
    return dbErrorResponse(error);
  }
}
