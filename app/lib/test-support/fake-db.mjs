// Minimal in-memory stand-in for the Prisma client — only the methods/shapes the
// routes actually use. A "fake" (per the test-double hierarchy), not a mock: it
// holds real state so tests assert on outcomes. NOT a general Prisma emulator.
//
// Seed shape (all optional):
//   { congregations:[{id,name,code}],
//     people:[{id,congregationId,name,status,lineUserId}],
//     weeks:[{id,congregationId,date,parts:[...]}],
//     assignments:[{slotId,weekId,name}],
//     weekendRows:[{id,congregationId,sortOrder,date,type,...}],
//     pendingLinks:[{lineUserId,congregationId}] }

const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

function matchField(value, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    const ci = cond.mode === 'insensitive';
    const norm = (s) => (ci ? String(s ?? '').toLowerCase() : String(s ?? ''));
    if ('equals' in cond) return norm(value) === norm(cond.equals);
    if ('startsWith' in cond) return norm(value).startsWith(norm(cond.startsWith));
    if ('contains' in cond) return norm(value).includes(norm(cond.contains));
    if ('not' in cond) return value !== cond.not;
    return false;
  }
  return value === cond;
}

const whereMatch = (item, where) =>
  Object.entries(where ?? {}).every(([k, cond]) => matchField(item[k], cond));

export function makeFakeDb(seed = {}) {
  const stores = {
    congregations: clone(seed.congregations ?? []),
    people: clone(seed.people ?? []),
    weeks: clone(seed.weeks ?? []),
    assignments: clone(seed.assignments ?? []),
    weekendRows: clone(seed.weekendRows ?? []),
    pendingLinks: clone(seed.pendingLinks ?? []),
    changeLogs: [],
  };
  let changeLogSeq = 1;

  const congregationFor = (id) => clone(stores.congregations.find((c) => c.id === id) ?? null);

  const hydrateWeek = (week, include) => {
    const out = clone(week);
    if (include?.assignments) {
      out.assignments = stores.assignments
        .filter((a) => a.weekId === week.id)
        .map((a) => ({ slotId: a.slotId, name: a.name }));
    }
    if (include?.parts) out.parts = clone(week.parts ?? []);
    return out;
  };

  return {
    __stores: stores,

    midweekWeek: {
      async findFirst({ where, include }) {
        const week = stores.weeks.find((w) => whereMatch(w, where));
        return week ? hydrateWeek(week, include) : null;
      },
      async findMany({ where, include, orderBy }) {
        let rows = stores.weeks.filter((w) => whereMatch(w, where));
        if (orderBy?.id) rows = rows.sort((a, b) => a.id - b.id);
        return rows.map((w) => hydrateWeek(w, include));
      },
    },

    assignment: {
      async findUnique({ where: { slotId } }) {
        return clone(stores.assignments.find((a) => a.slotId === slotId) ?? null);
      },
      async upsert({ where: { slotId }, create, update }) {
        const existing = stores.assignments.find((a) => a.slotId === slotId);
        if (existing) Object.assign(existing, update);
        else stores.assignments.push({ ...create });
        return clone(stores.assignments.find((a) => a.slotId === slotId));
      },
      async deleteMany({ where: { slotId } }) {
        const before = stores.assignments.length;
        stores.assignments = stores.assignments.filter((a) => a.slotId !== slotId);
        return { count: before - stores.assignments.length };
      },
    },

    weekendRow: {
      async findMany({ where, orderBy }) {
        let rows = stores.weekendRows.filter((r) => whereMatch(r, where));
        if (orderBy?.sortOrder) rows = rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        return clone(rows);
      },
      async update({ where: { id }, data }) {
        const row = stores.weekendRows.find((r) => r.id === id);
        Object.assign(row, data);
        return clone(row);
      },
    },

    person: {
      async findFirst({ where, include }) {
        const p = stores.people.find((x) => whereMatch(x, where));
        if (!p) return null;
        const out = clone(p);
        if (include?.congregation) out.congregation = congregationFor(p.congregationId);
        return out;
      },
      async update({ where: { id }, data }) {
        const p = stores.people.find((x) => x.id === id);
        Object.assign(p, data);
        return clone(p);
      },
    },

    linePendingLink: {
      async findUnique({ where: { lineUserId } }) {
        return clone(stores.pendingLinks.find((l) => l.lineUserId === lineUserId) ?? null);
      },
      async upsert({ where: { lineUserId }, update, create }) {
        const existing = stores.pendingLinks.find((l) => l.lineUserId === lineUserId);
        if (existing) Object.assign(existing, update);
        else stores.pendingLinks.push({ ...create });
        return clone(stores.pendingLinks.find((l) => l.lineUserId === lineUserId));
      },
      async delete({ where: { lineUserId } }) {
        stores.pendingLinks = stores.pendingLinks.filter((l) => l.lineUserId !== lineUserId);
        return { lineUserId };
      },
    },

    congregation: {
      async findFirst({ where }) {
        return clone(stores.congregations.find((c) => whereMatch(c, where)) ?? null);
      },
      async findMany({ where }) {
        return clone(stores.congregations.filter((c) => whereMatch(c, where)));
      },
    },

    changeLog: {
      async create({ data }) {
        const row = { id: changeLogSeq++, createdAt: new Date(), ...data };
        stores.changeLogs.push(row);
        return clone(row);
      },
      async findMany({ orderBy } = {}) {
        let rows = [...stores.changeLogs];
        if (orderBy?.createdAt === 'desc') rows = rows.reverse();
        return clone(rows);
      },
    },
  };
}
