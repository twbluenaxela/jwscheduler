import { CATEGORY_LABELS, FORMAT_LABELS, LANGUAGE_LABELS } from '../literature.mjs';

export const SERIES_LABELS = {
  w: '守望台研讀版', wlp: '守望台研讀版（大字版）', mwb: '聚會手冊', g: '警醒！', wp: '守望台（公眾版）',
};
export const STATUS_LABELS = { pending: '待訂', ordered: '已訂', received: '已到', delivered: '已發', cancelled: '已取消' };
const series = (value) => SERIES_LABELS[value] || value;
const language = (value) => LANGUAGE_LABELS[value] || value || '未知語言';
const state = (value) => STATUS_LABELS[value] || value;
const date = (value) => value ? new Date(value).toISOString().slice(0, 10) : '日期不明';
const pub = (value) => value ? `${value.name || '未知書刊'} ${value.code || ''}`.trim() : '未知書刊';
const flags = (row) => `${row.specialOrder ? '（特別預訂）' : ''}${row.orderable === false ? '（暫停訂購）' : ''}`;
const empty = (rows) => rows.length ? rows : ['無'];
const permitted = new Set([
  'id', 'personId', 'publicationId', 'requestId', 'shipmentId', 'countId', 'name', 'code', 'language', 'format', 'category',
  'itemNumber', 'serviceGroup', 'group', 'groupRole', 'series', 'quantity', 'status', 'note', 'active', 'createdAt', 'updatedAt',
  'deliveredAt', 'shippedAt', 'slipNumber', 'source', 'month', 'opening', 'received', 'onHand', 'distributed', 'counted', 'total',
  'publication', 'person', 'shipment', 'subscriptions', 'requests', 'deliveries', 'lines', 'count', 'groups', 'remainders', 'remainder',
  'subscribed', 'lastReceived', 'issueCode', 'diff', 'delivered', 'deliveredQuantity', 'short', 'rawCode', 'issue', 'lineCount',
  'totalQuantity', 'data', 'entries', 'literatureNote', 'orderable', 'specialOrder',
]);
export function cleanResult(value, key = '') {
  if (value instanceof Date) return date(value);
  if (Array.isArray(value)) return value.map((item) => cleanResult(item));
  if (!value || typeof value !== 'object') {
    if (value != null && (key === 'id' || key.endsWith('Id'))) return String(value);
    return value;
  }
  // Group maps use person and group names as keys, rather than database field names.
  const map = key === 'groups' || key === 'requestsByPerson' || key === 'groupMap';
  return Object.fromEntries(Object.entries(value).filter(([name]) => map || permitted.has(name)).map(([name, item]) => {
    const childKey = key === 'groups' ? 'groupMap' : name;
    return [name, cleanResult(item, childKey)];
  }));
}
function requestLine(row) {
  return `#${row.id} ${pub(row.publication)} ×${row.quantity} ${state(row.status)}${row.note ? `（${row.note}）` : ''}`;
}
function formatPerson(data) {
  const subscriptions = data.subscriptions.map((r) => `${series(r.series)} ${language(r.language)} ×${r.quantity}`);
  const requests = data.requests.map(requestLine);
  const deliveries = data.deliveries.map((r) => {
    const slip = r.shipment?.slipNumber ? `，裝箱單 ${r.shipment.slipNumber}` : '';
    return `${pub(r.publication)} ×${r.quantity}（${date(r.deliveredAt)}${slip}）`;
  });
  return [`${data.person}（${data.group || '未分組'}）`, ...(data.literatureNote ? [`書刊備註：${data.literatureNote}`] : []), `定期：${empty(subscriptions).join('；')}`,
    `申請：${empty(requests).join('；')}`, `近 60 天已發：${empty(deliveries).join('；')}`];
}
function formatSorting(data) {
  const lines = [];
  for (const [group, persons] of Object.entries(data.groups)) {
    lines.push(`${group}：`);
    for (const [name, items] of Object.entries(persons)) {
      const details = items.map((item) => {
        const mark = item.delivered ? '✓' : '✗';
        const short = item.short ? '（不足）' : '';
        return `${mark} ${pub(item.publication)} ×${item.quantity}${short}`;
      });
      lines.push(`  ${name}：${details.join('；')}`);
    }
  }
  lines.push('入庫餘量：');
  lines.push(...empty(data.remainders.map((item) => `  ${pub(item.publication)} ×${item.remainder}`)));
  return lines;
}
export function formatResult(name, summary, data) {
  let lines = [];
  switch (name) {
    case 'search_publications':
      lines = data.map((p) => `#${p.id} ${p.name} ${p.code}｜${language(p.language)}｜${FORMAT_LABELS[p.format] || p.format}` +
        `｜${CATEGORY_LABELS[p.category] || p.category}${p.itemNumber ? `｜品號 ${p.itemNumber}` : ''}`);
      break;
    case 'find_people':
      lines = data.map((p) => `${p.name}（${p.group || '未分組'}）${p.groupRole ? `｜${p.groupRole}` : ''}`);
      break;
    case 'get_person_literature': return formatPerson(data).join('\n');
    case 'get_shipment_sorting': return [summary, ...formatSorting(data)].join('\n');
    case 'list_open_requests':
      lines = Object.entries(data).flatMap(([person, rows]) => rows.map((r) =>
        `${person}（${r.person?.serviceGroup || '未分組'}）：${requestLine(r)}`));
      break;
    case 'subscription_totals':
      lines = data.map((r) => `${series(r.series)} ${language(r.language)}：×${r.subscribed}`);
      break;
    case 'order_checklist':
      lines = data.map((row) => `${row.label}：現在 ${row.now} 本，上次到 ${row.last} 本，改成 ${row.now}${flags(row)}`);
      break;
    case 'get_order_list': {
      // Paused titles stay visible as demand but do not count toward the order.
      const paused = [...data.toOrder, ...data.fromStock].filter((row) => row.orderable === false);
      lines = [
        '要訂：',
        ...data.toOrder.filter((row) => row.orderable !== false).map((row) => `${row.hubCode} ×${row.order}（需要 ${row.need}，庫存 ${row.stock}）${flags(row)}`),
        '庫存夠，直接發：',
        ...data.fromStock.filter((row) => row.orderable !== false).map((row) => `${row.hubCode} ×${row.need}${flags(row)}`),
        ...(paused.length ? ['暫停訂購（目前無法向分部訂購）：', ...paused.map((row) => `${row.hubCode} 需要 ${row.need}${flags(row)}`)] : []),
        '定期要調整：',
        ...data.standing.map((row) => `${row.label}：現在 ${row.now} 本，上次到 ${row.last} 本，改成 ${row.now}${flags(row)}`),
      ];
      break;
    }
    case 'list_shipments':
      lines = data.map((s) => `裝箱單 ${s.slipNumber}｜${date(s.shippedAt || s.createdAt)}｜` +
        `${s.lines.length} 項，共 ${s.lines.reduce((sum, line) => sum + line.quantity, 0)} 本`);
      break;
    case 'get_inventory': {
      const uncounted = data.lines.filter((r) => r.onHand === null);
      lines = data.lines.filter((r) => r.onHand > 0 || r.received > 0 || (r.distributed != null && r.distributed !== 0))
        .map((r) => `${pub(r.publication)}｜原有 ${r.opening}｜收 ${r.received}｜` +
          `現有 ${r.onHand ?? '未清點'}｜發 ${r.distributed ?? '未知'}`);
      const codes = uncounted.slice(0, 20).map((r) => r.publication?.code || '未知代碼');
      lines.push(`未清點：${uncounted.length} 項${codes.length ? `（${codes.join('、')}）` : ''}`);
      break;
    }
    case 'add_request': lines = [`申請 #${data.id}｜數量 ${data.quantity}｜${state(data.status)}`]; break;
    case 'update_request': lines = [requestLine(data)]; break;
    case 'set_subscription': lines = [`${series(data.series)} ${language(data.language)}｜${data.active ? `×${data.quantity}` : '已停用'}`]; break;
    case 'mark_delivered':
      lines = data.entries.map((entry) => `書刊 ID ${entry.publicationId} ×${entry.quantity}`);
      break;
    case 'set_on_hand': lines = [`現有 ${data.onHand}｜原有 ${data.opening}｜收 ${data.received}`]; break;
    case 'start_inventory_count': lines = [`${data.month}｜${data.lines?.length || 0} 項待清點`]; break;
    default: return summary;
  }
  return [summary, ...empty(lines)].join('\n');
}
