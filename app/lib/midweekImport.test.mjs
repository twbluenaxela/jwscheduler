import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeDb } from './test-support/fake-db.mjs';
import { reconcileImportedWeek, applyImport, orphanAssignments, isAddedPartKey } from './midweekImport.mjs';

const X1 = 'x_0123456789abcdef0123456789abcdef';

const part = (id, partKey, partNum, section, title, extra = {}) => ({
  id, partKey, partNum, section, title, scenario: '', dur: '5 分鐘', cat: section,
  roleLabel: null, time: '8:00', cbsRef: null, hideHelper: false, ...extra,
});
const incoming = (list) => list.map((p) => ({ ...p }));

function existingWeek() {
  return {
    id: 7,
    congregationId: 1,
    date: '12月 10日',
    isoDate: '2026-12-10',
    weekStart: '12月 7日',
    weekStartIso: '2026-12-07',
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

function seedDb(week) {
  return makeFakeDb({
    congregations: [{ id: 1, name: '測試', code: 't' }],
    weeks: [week],
    assignments: week.assignments.map((a) => ({ ...a })),
  });
}

test('isAddedPartKey recognises only the UI prefix', () => {
  assert.equal(isAddedPartKey(X1), true);
  assert.equal(isAddedPartKey('t0'), false);
  assert.equal(isAddedPartKey('cbs'), false);
  assert.equal(isAddedPartKey(null), false);
});

test('orphanAssignments finds assignments of removed parts', () => {
  const week = existingWeek();
  const finalKeys = new Set(['t0', 'm0', 'l0', 'cbs']);
  const orphans = orphanAssignments(week, week.assignments, finalKeys);
  assert.deepEqual(orphans.map((a) => a.slotId).sort(), [`mw7_${X1}_0`]);
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

test('reconcileImportedWeek (replace) removes x_ part + its assignment with ChangeLog, restores cbs, keeps surviving assignments, resets titles', async () => {
  const week = existingWeek();
  week.parts.find((p) => p.partKey === 'l0').title = '本地需要（管理員改過）';
  const db = seedDb(week);
  const loaded = await db.midweekWeek.findFirst({ where: { id: 7, congregationId: 1 }, include: { parts: true, assignments: true } });

  const inc = incoming([
    part(1, 't0', 1, 'treasures', '寶藏演講'),
    part(2, 'm0', 2, 'ministry', '初次交談'),
    part(3, 'l0', 3, 'living', '本地需要'),
    part(5, 'cbs', 5, 'living', '會眾研經班', { cat: 'cbs', roleLabel: '主持/朗讀' }),
  ]);
  const summary = await reconcileImportedWeek(db, { week: loaded, incomingParts: inc, congregationId: 1, actorName: '管理員' });

  assert.deepEqual(summary.removedPartKeys.sort(), [X1].sort());
  assert.deepEqual(summary.clearedSlotIds.sort(), [`mw7_${X1}_0`]);

  const keys = db.__stores.weeks[0].parts.map((p) => p.partKey).sort();
  assert.deepEqual(keys, ['cbs', 'l0', 'm0', 't0'].sort());

  // cbs restored with EPUB title/dur
  const cbs = db.__stores.weeks[0].parts.find((p) => p.partKey === 'cbs');
  assert.equal(cbs.title, '會眾研經班');

  // l0 title reset to EPUB value
  const l0 = db.__stores.weeks[0].parts.find((p) => p.partKey === 'l0');
  assert.equal(l0.title, '本地需要');

  // surviving assignments on t0 and cbs kept; x_ assignment cleared
  const slots = db.__stores.assignments.map((a) => a.slotId).sort();
  assert.ok(slots.includes('mw7_t0_0'));
  assert.ok(slots.includes('mw7_chairman'));
  assert.ok(slots.includes('mw7_cbs_0'));
  assert.ok(slots.includes('mw7_cbs_1'));
  assert.ok(!slots.includes(`mw7_${X1}_0`));

  // ChangeLog row for the cleared x_ assignment
  const logs = db.__stores.changeLogs;
  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'clear');
  assert.equal(logs[0].prevName, '乙');
});

test('reconcileImportedWeek cleans an orphan assignment whose part vanished earlier', async () => {
  const week = existingWeek();
  week.assignments.push({ id: 20, slotId: 'mw7_x_deadbeef_0', weekId: 7, name: '己' });
  const db = seedDb(week);
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
  assert.ok(summary.clearedSlotIds.includes('mw7_x_deadbeef_0'));
  assert.equal(db.__stores.assignments.some((a) => a.slotId === 'mw7_x_deadbeef_0'), false);
});

test('applyImport keep mode leaves existing week untouched incl. x_ part + assignments', async () => {
  const week = existingWeek();
  const db = seedDb(week);
  const inc = incoming([
    part(1, 't0', 1, 'treasures', '寶藏演講'),
    part(2, 'm0', 2, 'ministry', '初次交談'),
    part(3, 'l0', 3, 'living', '本地需要'),
  ]);
  const cleaned = [{ week: { ...week, parts: undefined }, parts: inc }];
  // cleanWeek-shaped: week has isoDate etc.; use existing week's fields
  cleaned[0].week = {
    date: week.date, isoDate: week.isoDate, weekStart: week.weekStart, weekStartIso: week.weekStartIso,
    weekdayPill: '星期三 · 19:30', reading: '', openSong: '', midSong: '', closeSong: '',
    openSongTime: null, midSongTime: null, closeSongTime: null, openIntroTime: null,
    closingTime: null, closingDur: null, dateLabel: null,
  };
  const result = await applyImport(db, { congregationId: 1, actorName: '管理員', weeks: cleaned, mode: 'keep' });
  assert.equal(result.results[0].action, 'kept');
  // x_ part still present
  assert.ok(db.__stores.weeks[0].parts.some((p) => p.partKey === X1));
  // assignment still present
  assert.ok(db.__stores.assignments.some((a) => a.slotId === `mw7_${X1}_0`));
  // no change logs
  assert.equal(db.__stores.changeLogs.length, 0);
});

test('applyImport replace mode removes x_ + restores cbs + keeps surviving assignments', async () => {
  const week = existingWeek();
  const db = seedDb(week);
  const inc = incoming([
    part(1, 't0', 1, 'treasures', '寶藏演講'),
    part(2, 'm0', 2, 'ministry', '初次交談'),
    part(3, 'l0', 3, 'living', '本地需要'),
    part(5, 'cbs', 5, 'living', '會眾研經班', { cat: 'cbs', roleLabel: '主持/朗讀' }),
  ]);
  const cleaned = [{ week: {
    date: week.date, isoDate: week.isoDate, weekStart: week.weekStart, weekStartIso: week.weekStartIso,
    weekdayPill: '星期三 · 19:30', reading: '', openSong: '', midSong: '', closeSong: '',
    openSongTime: null, midSongTime: null, closeSongTime: null, openIntroTime: null,
    closingTime: null, closingDur: null, dateLabel: null,
  }, parts: inc }];
  const result = await applyImport(db, { congregationId: 1, actorName: '管理員', weeks: cleaned, mode: 'replace' });
  assert.equal(result.results[0].action, 'replaced');
  assert.ok(result.results[0].clearedSlotIds.includes(`mw7_${X1}_0`));
  assert.ok(!db.__stores.weeks[0].parts.some((p) => p.partKey === X1));
  assert.ok(db.__stores.weeks[0].parts.some((p) => p.partKey === 'cbs'));
  assert.ok(db.__stores.assignments.some((a) => a.slotId === 'mw7_t0_0'));
  assert.ok(!db.__stores.assignments.some((a) => a.slotId === `mw7_${X1}_0`));
});

test('applyImport creates new weeks in both modes', async () => {
  const db = makeFakeDb({ congregations: [{ id: 1, name: '測試', code: 't' }], weeks: [], assignments: [] });
  const inc = incoming([part(1, 't0', 1, 'treasures', '寶藏演講')]);
  const cleaned = [{ week: {
    date: '12月 17日', isoDate: '2026-12-17', weekStart: '12月 14日', weekStartIso: '2026-12-14',
    weekdayPill: '星期三 · 19:30', reading: '', openSong: '', midSong: '', closeSong: '',
    openSongTime: null, midSongTime: null, closeSongTime: null, openIntroTime: null,
    closingTime: null, closingDur: null, dateLabel: null,
  }, parts: inc }];
  for (const mode of ['keep', 'replace']) {
    const db2 = makeFakeDb({ congregations: [{ id: 1, name: '測試', code: 't' }], weeks: [], assignments: [] });
    const r = await applyImport(db2, { congregationId: 1, actorName: '管理員', weeks: cleaned, mode });
    assert.equal(r.results[0].action, 'created');
    assert.equal(db2.__stores.weeks.length, 1);
  }
});

test('applyImport defaults to keep when mode omitted', async () => {
  const week = existingWeek();
  const db = seedDb(week);
  const inc = incoming([part(1, 't0', 1, 'treasures', '寶藏演講')]);
  const cleaned = [{ week: {
    date: week.date, isoDate: week.isoDate, weekStart: week.weekStart, weekStartIso: week.weekStartIso,
    weekdayPill: '星期三 · 19:30', reading: '', openSong: '', midSong: '', closeSong: '',
    openSongTime: null, midSongTime: null, closeSongTime: null, openIntroTime: null,
    closingTime: null, closingDur: null, dateLabel: null,
  }, parts: inc }];
  const r = await applyImport(db, { congregationId: 1, actorName: '管理員', weeks: cleaned });
  assert.equal(r.results[0].action, 'kept');
  assert.ok(db.__stores.weeks[0].parts.some((p) => p.partKey === X1));
});