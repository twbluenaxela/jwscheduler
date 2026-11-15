import db from '../db';
import { resolveMcpUser } from '../mcpAuth';
import { tools } from './tools';
import { publicOrigin } from '../publicOrigin.mjs';
import { dispatch } from './dispatch.mjs';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, authorization, mcp-protocol-version, mcp-session-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const error = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
export async function handlePost(request, token) {
  const user = await resolveMcpUser(token);
  if (!user) return Response.json({ error: '連結無效或已撤銷' }, { status: 401, headers: cors });
  let body;
  try { body = await request.json(); } catch { return Response.json(error(null, -32700, 'Parse error'), { headers: cors }); }
  const ctx = { db, congregationId: user.congregationId, user, origin: publicOrigin(request) };
  let response;
  if (Array.isArray(body)) {
    response = body.length ? (await Promise.all(body.map((item) => dispatch(item, ctx, tools)))).filter(Boolean) : error(null, -32600, 'Invalid Request');
    if (Array.isArray(response) && !response.length) return new Response(null, { status: 202, headers: cors });
  } else response = await dispatch(body, ctx, tools);
  if (!response) return new Response(null, { status: 202, headers: cors });
  return Response.json(response, { headers: cors });
}
export function options() { return new Response(null, { status: 204, headers: cors }); }
export function methodNotAllowed() { return new Response(null, { status: 405, headers: { ...cors, Allow: 'POST, OPTIONS' } }); }
