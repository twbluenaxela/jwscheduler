import { canEdit, canLiterature } from '../roles.mjs';
import { formatResult, cleanResult } from './formatters.mjs';

const allowed = (tool, ctx) => tool.domain === 'schedule' ? canEdit(ctx.user?.role) : canLiterature(ctx.user);
const error = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
function validateArguments(schema, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('工具參數必須是物件');
  for (const key of schema.required || []) {
    if (!(key in args)) throw new Error(`缺少必要參數：${key}`);
  }
  for (const [key, value] of Object.entries(args)) {
    const spec = schema.properties?.[key];
    if (!spec) throw new Error(`不支援的參數：${key}`);
    if (spec.type === 'integer' ? !Number.isInteger(value) : typeof value !== spec.type) {
      throw new Error(`參數格式無效：${key}`);
    }
    if (spec.enum && !spec.enum.includes(value)) throw new Error(`參數 ${key} 必須是：${spec.enum.join('、')}`);
  }
}
export async function dispatch(message, ctx, tools) {
  if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return error(message?.id ?? null, -32600, 'Invalid Request');
  }
  if (!Object.hasOwn(message, 'id')) return null;
  const { id, method, params = {} } = message;
  let result;
  if (method === 'initialize') {
    const versions = ['2025-06-18', '2025-03-26', '2024-11-05'];
    result = { protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0], capabilities: { tools: {} },
      serverInfo: { name: 'jwscheduler', version: '1.0.0' },
      instructions: '管理會眾書刊與聚會委派。姓名、節目或日期有歧義時請先詢問，勿猜測。修改後請在回覆中確認變更內容。發布通知請在應用程式中操作。' };
  } else if (method === 'ping') result = {};
  else if (method === 'tools/list') {
    const visible = tools.filter((t) => allowed(t, ctx));
    result = { tools: visible.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
  }
  else if (method === 'tools/call') {
    const tool = tools.find((t) => t.name === params.name);
    if (!tool || !allowed(tool, ctx)) result = { content: [{ type: 'text', text: '找不到工具' }], structuredContent: {}, isError: true };
    else {
      try {
        validateArguments(tool.inputSchema, params.arguments || {});
        const value = await tool.handler(ctx, params.arguments || {});
        result = { content: [{ type: 'text', text: tool.domain === 'schedule' ? value.summary : formatResult(tool.name, value.summary, value.data) }],
          structuredContent: { data: tool.domain === 'schedule' ? value.data : cleanResult(
            value.data, tool.name === 'list_open_requests' ? 'requestsByPerson' : '',
          ) } };
      } catch (e) {
        result = { content: [{ type: 'text', text: e.message || '操作失敗' }], structuredContent: { error: e.message || '操作失敗' }, isError: true };
      }
    }
  } else return error(id, -32601, 'Method not found');
  return { jsonrpc: '2.0', id, result };
}
