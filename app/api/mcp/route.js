export const dynamic = 'force-dynamic';
import { handlePost, options, methodNotAllowed } from '../../lib/mcp/server';
export async function POST(request) {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') || '')?.[1];
  return handlePost(request, token);
}
export const OPTIONS = options;
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
