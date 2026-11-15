export const dynamic = 'force-dynamic';
import { handlePost, options, methodNotAllowed } from '../../../lib/mcp/server';
export async function POST(request, context) { return handlePost(request, (await context.params).token); }
export const OPTIONS = options;
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
