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
    if ('in' in cond) return (cond.in ?? []).some((v) => norm(v) === norm(value));
    if ('notIn' in cond) return !(cond.notIn ?? []).some((v) => norm(v) === norm(value));
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
    calendarFeeds: clone(seed.calendarFeeds ?? []),
    serviceCategories: clone(seed.serviceCategories ?? []),
    serviceAssignments: clone(seed.serviceAssignments ?? []),
    fieldServiceMeetings: clone(seed.fieldServiceMeetings ?? []),
  };
  let changeLogSeq = 1;

  const congregationFor = (id) => clone(stores.congregations.find((c) => c.id === id) ?? null);

  const hydrateWeek = (week, include) => {
    const out = clone(week);
    if (include?.assignments) {
      out.assignments = stores.assignments
        .filter((a) => a.weekId === week.id)
        .map((a) => ({ ...a }));
    }
    if (include?.parts) out.parts = clone(week.parts ?? []);
    return out;
  };

  const api = {
    __stores: stores,

    // Routes wrap their writes in `db.$transaction(async (tx) => …)`; the fake
    // has no rollback, it just runs the callback against the same store.
    async $transaction(fn) { return fn(api); },

    serviceCategory: { async findMany({ where }) { return clone(stores.serviceCategories.filter(row => whereMatch(row, where))); } },
    serviceAssignment: { async findMany({ where }) { return clone(stores.serviceAssignments.filter(row => whereMatch(row, where))); } },
    fieldServiceMeeting: { async findMany({ where }) { return clone(stores.fieldServiceMeetings.filter(row => whereMatch(row, where))); } },
    calendarFeed: {
      async findUnique({ where } = {}) {
        return clone(stores.calendarFeeds.find((item) => whereMatch(item, where)) ?? null);
      },
      async findMany({ where, select } = {}) {
        const rows = stores.calendarFeeds.filter((item) => whereMatch(item, where));
        if (!select) return clone(rows);
        return clone(rows.map((item) => Object.fromEntries(Object.keys(select).map((key) => [key, item[key]]))));
      },
      async upsert({ where: { personId }, update, create }) {
        let feed = stores.calendarFeeds.find((item) => item.personId === personId);
        if (feed) Object.assign(feed, update);
        else {
          feed = { ...create, lastFetchedAt: null };
          stores.calendarFeeds.push(feed);
        }
        return clone(feed);
      },
    },

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
      async deleteMany({ where }) {
        const before = stores.assignments.length;
        stores.assignments = stores.assignments.filter((a) => {
          if (!where) return false;
          if (where.id && Array.isArray(where.id.in)) return !where.id.in.includes(a.id);
          if ('slotId' in where) {
            const cond = where.slotId;
            if (cond && typeof cond === 'object') {
              if ('startsWith' in cond) return !String(a.slotId).startsWith(cond.startsWith);
              if ('in' in cond) return !cond.in.includes(a.slotId);
              return true;
            }
            return a.slotId !== cond;
          }
          if (where.weekId !== undefined) return a.weekId !== where.weekId;
          return true;
        });
        return { count: before - stores.assignments.length };
      },
    },

    part: {
      async upsert({ where: { weekId_partKey: key }, update, create }) {
        const week = stores.weeks.find((w) => w.id === key.weekId);
        if (!week) return null;
        week.parts = week.parts ?? [];
        const existing = week.parts.find((p) => p.partKey === key.partKey);
        if (existing) Object.assign(existing, update);
        else {
          const id = stores.weeks.reduce((max, w) => Math.max(max, ...(w.parts ?? []).map((p) => p.id ?? 0)), 0) + 1;
          week.parts.push({ id, ...create });
        }
        return clone(week.parts.find((p) => p.partKey === key.partKey));
      },
      async update({ where: { id }, data }) {
        for (const week of stores.weeks) {
          const part = (week.parts ?? []).find((p) => p.id === id);
          if (part) { Object.assign(part, data); return clone(part); }
        }
        return null;
      },
      async findMany({ where } = {}) {
        const out = [];
        for (const week of stores.weeks) {
          if (where?.weekId !== undefined && week.id !== where.weekId) continue;
          for (const part of week.parts ?? []) {
            if (where?.partKey !== undefined && part.partKey !== where.partKey) continue;
            out.push(clone(part));
          }
        }
        return out;
      },
      async deleteMany({ where }) {
        let count = 0;
        for (const week of stores.weeks) {
          if (where?.weekId !== undefined && week.id !== where.weekId) continue;
          const keys = where?.partKey;
          const before = (week.parts ?? []).length;
          week.parts = (week.parts ?? []).filter((p) => {
            if (!keys) return true;
            if (keys.in) return !keys.in.includes(p.partKey);
            if ('notIn' in keys) return keys.notIn.includes(p.partKey);
            return p.partKey !== keys;
          });
          count += before - week.parts.length;
        }
        return { count };
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
      async findMany({ where } = {}) {
        return clone(stores.people.filter((x) => whereMatch(x, where)));
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
      async findUnique({ where }) {
        return clone(stores.congregations.find((c) => whereMatch(c, where)) ?? null);
      },
      async findFirst({ where }) {
        return clone(stores.congregations.find((c) => whereMatch(c, where)) ?? null);
      },
      async findMany({ where }) {
        return clone(stores.congregations.filter((c) => whereMatch(c, where)));
      },
      async update({ where: { id }, data }) {
        const row = stores.congregations.find((c) => c.id === id);
        if (row) Object.assign(row, clone(data));
        return clone(row ?? null);
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
  return api;
}
