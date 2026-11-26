import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from './test-support/fake-db.mjs';
import {
  planImportParts, planImportRenumber, orphanAssignments, reconcileImportedWeek, isAddedPartKey,
} from './midweekImport.mjs';

const X1 = 'x_0123456789abcdef0123456789abcdef';
const X2 = 'x_fedcba9876543210fedcba9876543210';

const part = (id, partKey, partNum, section, title, extra = {}) => ({
  id, partKey, partNum, section, title, scenario: '', dur: '5 分鐘', cat: section,
  roleLabel: null, time: '8:00', cbsRef: null, hideHelper: false, ...extra,
});
const incoming = (list) => list.map((p) => ({ ...p }));

// The week as it exists in the DB before the import: the EPUB parts plus a part
// the admin added in 基督徒的生活.
function existingWeek() {
  return {
    id: 7,
    congregationId: 1,
    date: '12月 10日',
    parts: [
      part(1, 't0', 1, 'treasures', '寶藏演講'),
      part(2, 'm0', 2, 'ministry', '初次交談', { roleLabel: '學生/助手' }),
      part(3, 'l0', 3, 'living', '本地需要'),
      part(4, X1, 4, 'living', '年度服務報告', { hideHelper: true }),
      part(5, 'cbs', 5, 'living', '會眾研經班', { cat: 'cbs', roleLabel: '主持/朗讀' }),
    ],
    assignments: [
      { id: 11, slotId: 'mw7_t0_0', weekId: 7, name: '甲' },
      { id: 12, slotId: `mw7_${X1}_0`, weekId: 7, name: '乙' },
      { id: 13, slotId: 'mw7_cbs_0', weekId: 7, name: '丙' },
      { id: 14, slotId: 'mw7_cbs_1', weekId: 7, name: '丁' },
      { id: 15, slotId: 'mw7_chairman', weekId: 7, name: '戊' },
    ],
  };
}

test('isAddedPartKey recognises only the UI prefix', () => {
  assert.equal(isAddedPartKey(X1), true);
  assert.equal(isAddedPartKey('t0'), false);
  assert.equal(isAddedPartKey('cbs'), false);
  assert.equal(isAddedPartKey(null), false);
});

test('planImportParts keeps x_ parts and marks the EPUB-dropped ones removed', () => {
  // The EPUB no longer lists cbs (the admin removed 會眾研經班 for a CO week).
  const inc = incoming([
    part(1, 't0', 1, 'treasures', '寶藏演講'),
    part(2, 'm0', 2, 'ministry', '初次交談'),
    part(3, 'l0', 3, 'living', '本地需要'),
  ]);
  const { retained, removed } = planImportParts(existingWeek().parts, inc);
  assert.deepEqual(retained.map((p) => p.partKey), [X1]);
  assert.deepEqual(removed.map((p) => p.partKey), ['cbs']);
});

test('planImportRenumber splices an x_ part back after its anchor', () => {
  const inc = incoming([
    part(1, 't0', 1, 'treasures', '寶藏演講'),
    part(2, 'm0', 2, 'ministry', '初次交談'),
    part(3, 'l0', 3, 'living', '本地需要'),
    part(4, 'l1', 4, 'living', '基督徒的生活'),
    part(5, 'cbs', 5, 'living', '會眾研經班'),
  ]);
  const ordered = planImportRenumber(existingWeek().parts, inc);
  // Existing: t0(1) m0(2) l0(3) X1(4) cbs(5) — the EPUB dropped the added part
  // from its numbering, so X1 goes back after l0 and everything after shifts +1.
  assert.deepEqual(ordered, [
    { partKey: 't0', partNum: 1 },
    { partKey: 'm0', partNum: 2 },
    { partKey: 'l0', partNum: 3 },
    { partKey: X1, partNum: 4 },
    { partKey: 'l1', partNum: 5 },
    { partKey: 'cbs', partNum: 6 },
  ]);
});

test('planImportRenumber keeps two added parts in their own order', () => {
  const existing = [part(1, 'l0', 1, 'living', '本地需要'), part(2, X1, 2, 'living', '一'),
    part(3, X2, 3, 'living', '二'), part(4, 'cbs', 4, 'living', '會眾研經班')];
  const inc = incoming([part(1, 'l0', 1, 'living', '本地需要'), part(2, 'cbs', 2, 'living', '會眾研經班')]);
  const ordered = planImportRenumber(existing, inc);
  assert.deepEqual(ordered, [
    { partKey: 'l0', partNum: 1 },
    { partKey: X1, partNum: 2 },
    { partKey: X2, partNum: 3 },
    { partKey: 'cbs', partNum: 4 },
  ]);
});

test('planImportRenumber is the identity when there are no added parts', () => {
  const ordered = planImportRenumber([], existingWeek().parts);
  assert.deepEqual(ordered, [
    { partKey: 't0', partNum: 1 },
    { partKey: 'm0', partNum: 2 },
    { partKey: 'l0', partNum: 3 },
    { partKey: X1, partNum: 4 },
    { partKey: 'cbs', partNum: 5 },
  ]);
});

test('orphanAssignments finds assignments of removed parts, not the added ones', () => {
  const week = existingWeek();
  const finalKeys = new Set(['t0', 'm0', 'l0', X1]);
  const orphans = orphanAssignments(week, week.assignments, finalKeys);
  assert.deepEqual(orphans.map((a) => a.slotId), ['mw7_cbs_0', 'mw7_cbs_1']);
});

test('orphanAssignments never touches chairman/prayer or another week', () => {
  const week = existingWeek();
  const assignments = [
    { id: 1, slotId: 'mw7_chairman', weekId: 7, name: '甲' },
    { id: 2, slotId: 'mw8_cbs_0', weekId: 8, name: '乙' },
    { id: 3, slotId: 'we3_speaker', weekId: 7, name: '丙' },
  ];
  assert.deepEqual(orphanAssignments(week, assignments, new Set(['t0'])), []);
});

test('reconcileImportedWeek keeps the added part, drops cbs and its assignments with a ChangeLog', async () => {
  const db = makeFakeDb({
    congregations: [{ id: 1, name: '測試', code: 't' }],
    weeks: [existingWeek()],
    assignments: existingWeek().assignments.map((a) => ({ ...a })),
  });
  const week = await db.midweekWeek.findFirst({ where: { id: 7, congregationId: 1 }, include: { parts: true, assignments: true } });

  const inc = incoming([
    part(1, 't0', 1, 'treasures', '寶藏演講'),
    part(2, 'm0', 2, 'ministry', '初次交談'),
    part(3, 'l0', 3, 'living', '本地需要'),
  ]);
  const summary = await reconcileImportedWeek(db, { week, incomingParts: inc, congregationId: 1, actorName: '管理員' });

  assert.deepEqual(summary.retainedPartKeys, [X1]);
  assert.deepEqual(summary.removedPartKeys, ['cbs']);
  assert.deepEqual(summary.orphanSlotIds, ['mw7_cbs_0', 'mw7_cbs_1']);

  const keys = db.__stores.weeks[0].parts.map((p) => p.partKey);
  assert.deepEqual(keys.sort(), ['l0', 'm0', X1, 't0'].sort());
  // The added part kept its title and position/timing fields.
  const kept = db.__stores.weeks[0].parts.find((p) => p.partKey === X1);
  assert.equal(kept.title, '年度服務報告');
  assert.equal(kept.partNum, 4);

  // No assignment refers to the deleted part any more; the added part's stays.
  const slots = db.__stores.assignments.map((a) => a.slotId).sort();
  assert.deepEqual(slots, ['mw7_chairman', 'mw7_t0_0', `mw7_${X1}_0`].sort());

  // Both removals were logged against the still-resolvable label.
  const logs = db.__stores.changeLogs;
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map((l) => l.action), ['clear', 'clear']);
  assert.match(logs[0].label, /會眾研經班.*主持/);
  assert.match(logs[1].label, /會眾研經班.*朗讀/);
});

test('reconcileImportedWeek drops a user-edited title back to the EPUB only for EPUB parts', async () => {
  const week = existingWeek();
  week.parts.find((p) => p.partKey === 'l0').title = '本地需要（管理員改過）';
  week.parts.find((p) => p.partKey === X1).title = '管理員自訂標題';
  const db = makeFakeDb({
    congregations: [{ id: 1, name: '測試', code: 't' }],
    weeks: [week],
    assignments: week.assignments.map((a) => ({ ...a })),
  });
  const loaded = await db.midweekWeek.findFirst({ where: { id: 7, congregationId: 1 }, include: { parts: true, assignments: true } });
  await reconcileImportedWeek(db, {
    week: loaded,
    incomingParts: incoming([
      part(1, 't0', 1, 'treasures', '寶藏演講'),
      part(2, 'm0', 2, 'ministry', '初次交談'),
      part(3, 'l0', 3, 'living', '本地需要'),
    ]),
    congregationId: 1,
    actorName: '管理員',
  });
  const parts = db.__stores.weeks[0].parts;
  assert.equal(parts.find((p) => p.partKey === 'l0').title, '本地需要');
  assert.equal(parts.find((p) => p.partKey === X1).title, '管理員自訂標題');
});

test('reconcileImportedWeek cleans an orphan assignment whose part vanished earlier', async () => {
  const week = existingWeek();
  week.assignments.push({ id: 20, slotId: 'mw7_x_deadbeef_1', weekId: 7, name: '己' });
  const db = makeFakeDb({
    congregations: [{ id: 1, name: '測試', code: 't' }],
    weeks: [week],
    assignments: week.assignments.map((a) => ({ ...a })),
  });
  const loaded = await db.midweekWeek.findFirst({ where: { id: 7, congregationId: 1 }, include: { parts: true, assignments: true } });
  const summary = await reconcileImportedWeek(db, {
    week: loaded,
    incomingParts: incoming([
      part(1, 't0', 1, 'treasures', '寶藏演講'),
      part(2, 'm0', 2, 'ministry', '初次交談'),
      part(3, 'l0', 3, 'living', '本地需要'),
      part(4, 'cbs', 4, 'living', '會眾研經班'),
    ]),
    congregationId: 1,
    actorName: '管理員',
  });
  assert.ok(summary.orphanSlotIds.includes('mw7_x_deadbeef_1'));
  assert.equal(db.__stores.assignments.some((a) => a.slotId === 'mw7_x_deadbeef_1'), false);
});
