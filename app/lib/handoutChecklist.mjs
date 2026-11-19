export const personKey = (person) => person.guestKey || String(person.personId);

function refresh(entry) {
  const checkedCount = entry.items.filter((item) => item.checked).length;
  return {
    ...entry,
    checkedCount,
    total: entry.items.length,
    done: entry.items.length > 0 && checkedCount === entry.items.length,
  };
}

function compareStableValue(left, right) {
  const a = String(left ?? '');
  const b = String(right ?? '');
  const numericA = Number(a);
  const numericB = Number(b);
  if (a !== '' && b !== '' && Number.isFinite(numericA) && Number.isFinite(numericB)) {
    return numericA - numericB;
  }
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function compareItems(left, right) {
  return compareStableValue(left.publicationId, right.publicationId)
    || compareStableValue(left.requestId ?? '', right.requestId ?? '')
    || compareStableValue(left.source, right.source);
}

export function buildChecklist({ people = [], delivered = [] }) {
  const entries = new Map();
  const add = (person, checked, index) => {
    const key = personKey(person);
    if (!entries.has(key)) entries.set(key, {
      key, personId: person.personId, guest: Boolean(person.guest), guestKey: person.guestKey,
      requestId: person.requestId, name: person.name, serviceGroup: person.serviceGroup,
      groupRole: person.groupRole, items: [], deliveredAt: undefined,
    });
    const entry = entries.get(key);
    if (checked && person.deliveredAt && (!entry.deliveredAt || person.deliveredAt > entry.deliveredAt)) entry.deliveredAt = person.deliveredAt;
    const seen = new Set(entry.items.map((item) => item.key));
    person.items.forEach((item, i) => {
      if (seen.has(item.key)) return;
      seen.add(item.key);
      entry.items.push({ ...item, checked, deliveryId: checked ? (item.deliveryId ?? person.deliveryIds?.[i]) : undefined });
    });
  };
  people.forEach((person) => add(person, false));
  delivered.forEach((person) => add(person, true));
  return [...entries.values()].map((entry) => refresh({
    ...entry,
    items: [...entry.items].sort(compareItems),
  }));
}

export function applyCheck(list, key, itemKeys, { deliveryIds = [], at } = {}) {
  let deliveryIndex = 0;
  return list.map((entry) => {
    if (entry.key !== key) return entry;
    const targets = new Set(itemKeys);
    const items = entry.items.map((item) => {
      if (!targets.has(item.key)) return item;
      const deliveryId = deliveryIds[deliveryIndex++];
      return { ...item, checked: true, ...(deliveryId !== undefined ? { deliveryId } : {}) };
    });
    const next = refresh({ ...entry, items });
    return next.done && !entry.done && at ? { ...next, deliveredAt: at } : next;
  });
}

export function applyUncheck(list, key, itemKeys) {
  const targets = new Set(itemKeys);
  return list.map((entry) => entry.key === key
    ? refresh({ ...entry, items: entry.items.map((item) => targets.has(item.key) ? { ...item, checked: false, deliveryId: undefined } : item) })
    : entry);
}

export function pendingStats(list) {
  const pending = list.filter((entry) => entry.items.some((item) => !item.checked));
  return { people: pending.length, quantity: pending.reduce((sum, entry) => sum + entry.items.reduce((n, item) => n + (!item.checked ? item.quantity : 0), 0), 0) };
}
