import { matchPublications } from '../literature.mjs';
import { localizedName } from '../publicForm.mjs';
import { allocateShipment, seriesOf } from '../literatureShipments.mjs';
import { isCountable } from '../literatureInventory.mjs';
import { resolvePerson, resolvePublication } from './resolution.mjs';

export function createTools({ countData, refreshLines, validateMonth, nonnegative, quantity, note, status, id }) {
const field = (type, description, extra = {}) => ({ type, description, ...extra });
const string = (description, extra) => field('string', description, extra);
const number = (description, extra) => field('integer', description, extra);
const people = (ctx) => ctx.db.person.findMany({ where: { congregationId: ctx.congregationId, status: { not: 'inactive' } } });
const publications = (ctx) => ctx.db.publication.findMany({ where: { congregationId: ctx.congregationId } });
const person = async (ctx, name) => resolvePerson(name, await people(ctx));
const publication = async (ctx, args) => resolvePublication(args, await publications(ctx));
const output = (summary, data) => ({ summary, data });
const definition = (name, description, properties, required, handler) => ({
  name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }, handler,
});
const pubFields = { publication: string('書刊名稱或代碼'), publication_id: string('書刊 ID') };
const personField = { person: string('姓名') };
async function totals(ctx) {
  const rows = await ctx.db.literatureSubscription.findMany({ where: { congregationId: ctx.congregationId, active: true } });
  const map = new Map();
  for (const row of rows) {
    const key = `${row.series}:${row.language}`;
    const item = map.get(key) || { series: row.series, language: row.language, subscribed: 0 };
    item.subscribed += row.quantity;
    map.set(key, item);
  }
  return [...map.values()];
}
async function sorting(ctx, slip) {
  const shipment = await ctx.db.shipment.findFirst({ where: { congregationId: ctx.congregationId, slipNumber: String(slip) }, include: { lines: true } });
  if (!shipment) throw new Error('找不到裝箱單');
  const [pubs, persons, subscriptions, requests, deliveries] = await Promise.all([
    publications(ctx), people(ctx), ctx.db.literatureSubscription.findMany({ where: { congregationId: ctx.congregationId } }),
    ctx.db.literatureRequest.findMany({ where: { congregationId: ctx.congregationId } }),
    ctx.db.literatureDelivery.findMany({ where: { congregationId: ctx.congregationId, shipmentId: shipment.id } }),
  ]);
  return { shipment, allocations: allocateShipment({ lines: shipment.lines, shippedAt: shipment.shippedAt ?? shipment.createdAt, publications: pubs, people: persons, subscriptions, requests, deliveries }) };
}
return [
  definition('search_publications', '搜尋書刊 search publications catalog', { query: string('搜尋文字'), limit: number('最多筆數') }, ['query'], async (ctx, a) => {
    const all = await publications(ctx);
    const rows = matchPublications(a.query, all, { limit: Math.min(100, Math.max(1, a.limit ?? 20)) });
    const data = rows.map((p) => ({ id: p.id, code: p.code, name: localizedName(p, all), language: p.language, format: p.format, category: p.category, itemNumber: p.itemNumber }));
    return output(`找到 ${data.length} 筆書刊`, data);
  }),
  definition('find_people', '尋找會眾成員 find people group', { query: string('姓名'), group: string('小組') }, [], async (ctx, a) => {
    const rows = (await people(ctx)).filter((p) => (!a.query || p.name.includes(a.query)) && (!a.group || p.serviceGroup === a.group));
    return output(`找到 ${rows.length} 位成員`, rows.map(({ name, serviceGroup, groupRole }) => ({ name, group: serviceGroup, groupRole })));
  }),
  definition('get_person_literature', '查詢個人書刊 subscriptions requests deliveries', personField, ['person'], async (ctx, a) => {
    const p = await person(ctx, a.person);
    const where = { congregationId: ctx.congregationId, personId: p.id };
    const [subscriptions, requests, deliveries] = await Promise.all([
      ctx.db.literatureSubscription.findMany({ where: { ...where, active: true } }),
      ctx.db.literatureRequest.findMany({ where: { ...where, status: { in: ['pending', 'ordered', 'received'] } }, include: { publication: true } }),
      ctx.db.literatureDelivery.findMany({
        where: { ...where, deliveredAt: { gte: new Date(Date.now() - 60 * 86400000) } },
        include: { publication: true, shipment: true },
      }),
    ]);
    return output(`${p.name}的書刊資料`, { person: p.name, group: p.serviceGroup, literatureNote: p.literatureNote, subscriptions, requests, deliveries });
  }),
  definition('add_request', '新增書刊申請 add request order',
    { ...personField, ...pubFields, quantity: number('數量'), note: string('備註') }, ['person'], async (ctx, a) => {
    const p = await person(ctx, a.person);
    const pub = await publication(ctx, a);
    const row = await ctx.db.literatureRequest.create({ data: { congregationId: ctx.congregationId, personId: p.id,
      publicationId: pub.id, quantity: quantity(a.quantity ?? 1), note: note(a.note), status: 'pending' } });
    return output(`已為${p.name}新增：${pub.name} ${pub.code} ×${row.quantity}（待訂）`, row);
  }),
  definition('set_subscription', '設定定期訂閱 set subscription', { ...personField, series: string('系列', { enum: ['w', 'wlp', 'mwb', 'g', 'wp'] }),
    language: string('語言', { enum: ['CHT', 'ENG', 'JPN'] }), quantity: number('數量，0 停用') }, ['person', 'series', 'quantity'], async (ctx, a) => {
    const p = await person(ctx, a.person);
    if (!['w', 'wlp', 'mwb', 'g', 'wp'].includes(a.series) || !['CHT', 'ENG', 'JPN'].includes(a.language ?? 'CHT')) throw new Error('系列或語言無效');
    nonnegative(a.quantity);
    const language = a.language ?? 'CHT';
    const data = { quantity: a.quantity || 1, active: a.quantity > 0 };
    const row = await ctx.db.literatureSubscription.upsert({ where: { personId_series_language: { personId: p.id, series: a.series, language } },
      create: { congregationId: ctx.congregationId, personId: p.id, series: a.series, language, ...data }, update: data });
    return output(`已設定${p.name}的 ${a.series} ${language} 訂閱數量為 ${a.quantity}`, row);
  }),
  definition('update_request', '更新申請 update request status',
    { request_id: string('申請 ID'), status: string('狀態'), quantity: number('數量'), note: string('備註') },
    ['request_id'], async (ctx, a) => {
    const row = await ctx.db.literatureRequest.findFirst({ where: { id: id(a.request_id), congregationId: ctx.congregationId } });
    if (!row) throw new Error('找不到申請');
    const data = {};
    if (a.quantity !== undefined) data.quantity = quantity(a.quantity);
    if (a.note !== undefined) data.note = note(a.note);
    if (a.status !== undefined) {
      data.status = status(a.status);
      data.deliveredAt = a.status === 'delivered' ? row.deliveredAt ?? new Date() : null;
    }
    const updated = await ctx.db.literatureRequest.update({ where: { id: row.id }, data, include: { publication: true } });
    return output('已更新申請', updated);
  }),
  definition('list_open_requests', '列出未完成申請 list open requests', { status: string('狀態'), group: string('小組') }, [], async (ctx, a) => {
    if (a.status) status(a.status);
    const rows = await ctx.db.literatureRequest.findMany({ where: { congregationId: ctx.congregationId,
      status: a.status || { in: ['pending', 'ordered', 'received'] } }, include: { person: true, publication: true } });
    const grouped = {};
    for (const row of rows.filter((r) => !a.group || r.person?.serviceGroup === a.group)) (grouped[row.person?.name || `${row.guestName || '訪客'}（名單外）`] ||= []).push(row);
    return output(`共有 ${Object.keys(grouped).length} 位成員有申請`, grouped);
  }),
  definition('subscription_totals', '訂閱總數 subscription totals JW Hub', {}, [], async (ctx) => output('定期訂閱總數', await totals(ctx))),
  definition('list_shipments', '列出裝箱單 list shipments', { limit: number('筆數') }, [], async (ctx, a) => output('最近裝箱單',
    await ctx.db.shipment.findMany({ where: { congregationId: ctx.congregationId }, include: { lines: true },
      orderBy: { createdAt: 'desc' }, take: Math.min(100, Math.max(1, a.limit ?? 5)) }))),
  definition('get_shipment_sorting', '裝箱單分發清單 shipment sorting allocations', { slip_number: string('裝箱單號') }, ['slip_number'], async (ctx, a) => {
    const result = await sorting(ctx, a.slip_number);
    const groups = {};
    for (const item of result.allocations) for (const recipient of item.recipients) {
      const group = groups[recipient.serviceGroup || '未分組'] ||= {};
      (group[recipient.name] ||= []).push({ publication: item.publication, ...recipient });
    }
    return output(`裝箱單 ${a.slip_number} 分發清單`, { groups, remainders: result.allocations.map((x) => ({ publication: x.publication, remainder: x.remainder })) });
  }),
  definition('mark_delivered', '標記或取消發放 mark delivered',
    { slip_number: string('裝箱單號'), ...personField, publication: string('書刊'), delivered: field('boolean', '是否已發放') },
    ['slip_number', 'person'], async (ctx, a) => {
    const p = await person(ctx, a.person);
    const result = await sorting(ctx, a.slip_number);
    const pub = a.publication ? await publication(ctx, a) : null;
    const entries = result.allocations.filter((x) => !pub || x.publication?.id === pub.id)
      .flatMap((x) => x.recipients.filter((r) => r.personId === p.id).map((r) => ({ ...r, publicationId: x.publication.id })));
    if (!entries.length) throw new Error('此裝箱單沒有分配給此人的指定書刊');
    await ctx.db.$transaction(async (tx) => {
      for (const entry of entries) {
        const where = { congregationId: ctx.congregationId, shipmentId: result.shipment.id, personId: p.id,
          publicationId: entry.publicationId, requestId: entry.requestId ?? null };
        if (a.delivered === false) {
          await tx.literatureDelivery.deleteMany({ where });
          if (entry.requestId) await tx.literatureRequest.updateMany({
            where: { id: entry.requestId, status: 'delivered' }, data: { status: 'received', deliveredAt: null },
          });
        } else if (!entry.delivered) {
          const delivery = await tx.literatureDelivery.create({ data: { ...where, quantity: entry.quantity } });
          if (entry.requestId) await tx.literatureRequest.update({
            where: { id: entry.requestId }, data: { status: 'delivered', deliveredAt: delivery.deliveredAt },
          });
        }
      }
    });
    return output(`已${a.delivered === false ? '取消' : '標記'}${p.name}的發放紀錄（裝箱單 ${a.slip_number}）`,
      { count: entries.length, entries });
  }),
  definition('get_inventory', '查詢庫存清點 get inventory count', { month: string('月份 YYYY-MM') }, [], async (ctx, a) => {
    const where = { congregationId: ctx.congregationId };
    const count = a.month ? await ctx.db.inventoryCount.findFirst({ where: { ...where, month: validateMonth(a.month) } }) :
      await ctx.db.inventoryCount.findFirst({ where: { ...where, status: 'draft' }, orderBy: { month: 'desc' } }) ||
      await ctx.db.inventoryCount.findFirst({ where, orderBy: { month: 'desc' } });
    if (!count) throw new Error('找不到庫存清點');
    const lines = await refreshLines(count);
    const pubs = await publications(ctx);
    const rows = lines.map((line) => ({ ...line, publication: pubs.find((p) => p.id === line.publicationId),
      distributed: line.onHand === null ? null : line.opening + line.received - line.onHand }));
    return output(`${count.month} 庫存清點：${rows.filter((x) => x.onHand !== null).length}/${rows.length}`, { count, lines: rows });
  }),
  definition('set_on_hand', '設定現有庫存 set on hand inventory',
    { month: string('月份 YYYY-MM'), code_or_query: string('代碼或名稱'), on_hand: number('現有數量') },
    ['month', 'code_or_query', 'on_hand'], async (ctx, a) => {
    const count = await ctx.db.inventoryCount.findFirst({ where: { congregationId: ctx.congregationId, month: validateMonth(a.month) } });
    if (!count) throw new Error('找不到清點月份');
    if (count.status !== 'draft') throw new Error('此月份已完成清點');
    const pub = await publication(ctx, { publication: a.code_or_query });
    let line = await ctx.db.inventoryLine.findFirst({ where: { countId: count.id, publicationId: pub.id } });
    if (!line) {
      if (!isCountable(pub)) throw new Error('此書刊不列入清點');
      const data = await countData(ctx.congregationId, count.month);
      line = await ctx.db.inventoryLine.create({ data: { countId: count.id, publicationId: pub.id,
        opening: data.previousLines.find((x) => x.publicationId === pub.id)?.onHand ?? 0, received: data.received.get(pub.id) || 0 } });
    }
    const updated = await ctx.db.inventoryLine.update({ where: { id: line.id }, data: { onHand: nonnegative(a.on_hand) } });
    return output(`已將 ${pub.name} ${pub.code} 的現有數量改為 ${a.on_hand}`, updated);
  }),
  definition('start_inventory_count', '開始庫存清點 start inventory count', { month: string('月份 YYYY-MM') }, ['month'], async (ctx, a) => {
    const month = validateMonth(a.month);
    const { lines } = await countData(ctx.congregationId, month);
    const count = await ctx.db.inventoryCount.create({
      data: { congregationId: ctx.congregationId, month, lines: { create: lines } }, include: { lines: true },
    });
    return output(`已開始 ${month} 庫存清點`, count);
  }),
  definition('order_checklist', '核對定期訂單 order checklist standing orders', {}, [], async (ctx) => {
    const rows = await totals(ctx);
    const shipments = await ctx.db.shipment.findMany({
      where: { congregationId: ctx.congregationId }, include: { lines: { include: { publication: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const result = rows.filter((x) => ['w', 'wlp', 'mwb'].includes(x.series)).map((row) => {
      const lines = shipments.flatMap((s) => s.lines).filter((l) => seriesOf(l.publication.code) === row.series && l.publication.language === row.language);
      lines.sort((a, b) => (b.publication.issue || '').localeCompare(a.publication.issue || ''));
      const latest = lines[0];
      const received = latest ? lines.filter((l) => l.publicationId === latest.publicationId).reduce((sum, l) => sum + l.quantity, 0) : 0;
      return { ...row, lastReceived: received, issueCode: latest?.publication.code ?? null, diff: received - row.subscribed };
    });
    return output('定期訂單核對', result);
  }),
];

}
