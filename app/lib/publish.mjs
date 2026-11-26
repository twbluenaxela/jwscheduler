// Framework-free core for POST /api/meetings/publish (LINE 聚會節目通知).
// The Prisma client and the LINE push function are injected — the same pattern
// as mutations.mjs / line-webhook.mjs — so the diff and the exact message text
// are unit-testable against the in-memory fake and a push spy. No network, no
// Prisma singleton, no next/server. The route file owns auth + HTTP plumbing.

import { collectAssignments, itemKey, parseCnDate } from './assignments.mjs';

const CALENDAR_NUDGE = '\n\n📅 想讓安排自動出現在手機行事曆？回覆「行事曆」就可以。';

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

// One person's notification text, or null when there is nothing to send.
// `previous === null` means first publish → the full upcoming list. Otherwise
// it is a diff of future items only (a past date rolling over between two
// publishes must not look like a cancellation).
//
// Items may carry a `slotId` (mw<week>_<partKey>_<index>, mw<week>_chairman,
// we<row>_<field>). A title edit keeps the slot but changes the role text,
// which is part of itemKey (date|role) — so it would surface as ✖ + ✚. When
// BOTH sides carry a slotId we match them back up and emit a single ✎ line.
// Old snapshots written before slotId existed fall back to ✖ + ✚ unchanged.
export function buildMessage(name, current, previous, { now = new Date() } = {}) {
  const header = `【新屋會眾 · 聚會節目通知】\n${name}，你好！`;

  // First time — send full list
  if (previous === null) {
    if (!current.length) return null; // no assignments, skip
    const list = current.map((i) => `▸ ${i.date}  ${i.role}`).join('\n');
    return `${header}\n\n以下是你目前的安排（共 ${current.length} 項）：\n\n${list}\n\n如有疑問請聯絡編排負責人。`;
  }

  const today = startOfDay(now);
  const prevFuture = previous.filter((i) => { const d = parseCnDate(i.date, now); return d && d >= today; });

  const curSet = new Set(current.map(itemKey));
  const prevSet = new Set(prevFuture.map(itemKey));
  const renamed = [];
  const claimedRemoved = new Set();

  const added = current.filter((i) => {
    if (prevSet.has(itemKey(i))) return false;
    if (i.slotId) {
      const oldIndex = prevFuture.findIndex((old, idx) => (
        !claimedRemoved.has(idx)
        && old.slotId === i.slotId
        && old.date === i.date
        && !curSet.has(itemKey(old))
      ));
      if (oldIndex !== -1) {
        claimedRemoved.add(oldIndex);
        renamed.push({ item: i, previous: prevFuture[oldIndex] });
        return false;
      }
    }
    return true;
  });
  const removed = prevFuture.filter((i, idx) => !curSet.has(itemKey(i)) && !claimedRemoved.has(idx));

  if (!renamed.length && !added.length && !removed.length) return null; // no changes, skip

  const lines = [`${header}\n\n你的安排有更新：`];
  if (renamed.length) {
    lines.push('\n修改：');
    renamed.forEach(({ item, previous: old }) => lines.push(`  ✎ ${item.date}  ${item.role}（原：${old.role}）`));
  }
  if (added.length) {
    lines.push('\n新增：');
    added.forEach((i) => lines.push(`  ✚ ${i.date}  ${i.role}`));
  }
  if (removed.length) {
    lines.push('\n取消：');
    removed.forEach((i) => lines.push(`  ✖ ${i.date}  ${i.role}`));
  }
  lines.push('\n如有疑問請聯絡編排負責人。');
  return lines.join('\n');
}

// Pure plan: no DB, no network.
//   people   — the LINE-linked active members (the push targets)
//   snapshot — Congregation.publishedSnapshot, or null before the first publish
//   needsCalendarNudge — Set/array of person ids that have not fetched their
//                        calendar feed yet (the route's 📅 one-liner)
// Returns { messages: [{ personId, lineUserId, name, text }], nextSnapshot }.
// nextSnapshot holds the LINE-linked active people only — the same set the loop
// above visits. It is deliberately NOT padded with non-linked names: a member
// with no entry has no previous state, so the next publish (after they link)
// sends them the full upcoming list instead of a diff against a baseline they
// never received.
export function buildPublishPlan({
  weeks = [],
  weekendRows = [],
  people = [],
  snapshot = null,
  now = new Date(),
  needsCalendarNudge = [],
} = {}) {
  const nudgeIds = needsCalendarNudge instanceof Set ? needsCalendarNudge : new Set(needsCalendarNudge);
  const nextSnapshot = {};
  const messages = [];

  for (const person of people) {
    const current = collectAssignments(person.name, weeks, weekendRows, { now });
    nextSnapshot[person.name] = current;
    // A name absent from the snapshot has never been sent anything (they were
    // not LINE-linked at the previous publish), so treat them as a first
    // publish. `[]` (present, empty) stays a real "you had nothing" baseline.
    const previous = snapshot && Object.hasOwn(snapshot, person.name) ? (snapshot[person.name] ?? []) : null;
    let text = buildMessage(person.name, current, previous, { now });
    if (!text) continue;
    if (nudgeIds.has(person.id)) text += CALENDAR_NUDGE;
    messages.push({ personId: person.id, lineUserId: person.lineUserId, name: person.name, text });
  }

  return { messages, nextSnapshot };
}

// DB-facing wrapper used by the route: load, diff, push, save snapshot.
// Assumes auth/permission checks are already done (like mutations.mjs).
export async function applyPublish(db, user, { push, now = new Date() } = {}) {
  const congId = user.congregationId;

  const [congregation, weeks, weekendRows, people] = await Promise.all([
    db.congregation.findUnique({ where: { id: congId }, select: { publishedSnapshot: true } }),
    db.midweekWeek.findMany({
      where: { congregationId: congId },
      orderBy: { id: 'asc' },
      include: { parts: true, assignments: true },
    }),
    db.weekendRow.findMany({
      where: { congregationId: congId },
      orderBy: { sortOrder: 'asc' },
    }),
    db.person.findMany({
      where: { congregationId: congId, lineUserId: { not: null }, status: 'active' },
    }),
  ]);

  const feeds = await db.calendarFeed.findMany({
    where: { personId: { in: people.map((person) => person.id) } },
    select: { personId: true, lastFetchedAt: true },
  });
  const fetchedPeople = new Set(feeds.filter((feed) => feed.lastFetchedAt).map((feed) => feed.personId));
  const needsCalendarNudge = people.filter((person) => !fetchedPeople.has(person.id)).map((person) => person.id);

  const plan = buildPublishPlan({
    weeks,
    weekendRows,
    people,
    snapshot: congregation.publishedSnapshot ?? null,
    now,
    needsCalendarNudge,
  });

  let sent = 0;
  let failed = 0;
  const errors = [];

  for (const message of plan.messages) {
    try {
      const result = await push(message.lineUserId, message.text);
      if (!result.ok) throw new Error(result.error);
      sent++;
    } catch (err) {
      failed++;
      errors.push(`${message.name}: ${err.message}`);
    }
  }

  // Save new snapshot
  await db.congregation.update({
    where: { id: congId },
    data: { publishedSnapshot: plan.nextSnapshot },
  });

  return { sent, failed, skipped: people.length - plan.messages.length, total: people.length, errors };
}
