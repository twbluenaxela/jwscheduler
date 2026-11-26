import test from 'node:test';
import assert from 'node:assert/strict';
import { diffWeek, formatDiffLine, diffImport } from './reimportDiff.mjs';

const mkPart = (id, title, dur, roleLabel, hideHelper, assign) => ({
  id, title, dur, roleLabel, hideHelper: !!hideHelper, assign: assign ?? [],
});

const existingWeek = {
  date: '12月 3日',
  treasures: [mkPart('t0', '上帝話語的寶藏', '10 分鐘', undefined, false, ['甲'])],
  ministry: [mkPart('m0', '初次交談', '5 分鐘', '學生/助手', false, ['乙', '丙'])],
  living: [
    mkPart('l0', '基督徒的生活', '10 分鐘', undefined, false, []),
    mkPart('x_abc', '新增節目', '3 分鐘', undefined, false, ['丁']),
    mkPart('cbs', '會眾研經班', '30 分鐘', '主持/朗讀', true, ['戊']),
  ],
};

const incomingWeek = {
  date: '12月 3日',
  treasures: [mkPart('t0', '上帝話語的寶藏', '10 分鐘')],
  ministry: [mkPart('m0', '初次交談', '7 分鐘', '學生/助手')],
  living: [
    mkPart('l0', '基督徒的生活', '10 分鐘'),
    mkPart('cbs', '會眾研經班', '30 分鐘', '主持/朗讀'),
  ],
};

test('diffWeek detects added parts', () => {
  const d = diffWeek(existingWeek, incomingWeek);
  assert.equal(d.added.length, 1);
  assert.equal(d.added[0].id, 'x_abc');
});

test('diffWeek detects deleted (EPUB-restored) parts', () => {
  const d = diffWeek(existingWeek, incomingWeek);
  // cbs exists in both → not deleted; nothing in EPUB missing from DB? Actually incoming has cbs, existing has cbs → not deleted.
  // l0/t0/m0 all present. So deleted 0.
  assert.equal(d.deleted.length, 0);
});

test('diffWeek detects retitled and duration changes', () => {
  const a = { date: '1/1', treasures: [mkPart('t0', 'A', '10 分鐘')], ministry: [], living: [] };
  const b = { date: '1/1', treasures: [mkPart('t0', 'A renamed', '12 分鐘')], ministry: [], living: [] };
  const d = diffWeek(a, b);
  assert.equal(d.retitled.length, 1);
  assert.equal(d.durChanged.length, 1);
});

test('diffWeek detects helper slot change', () => {
  const a = { date: '1/1', treasures: [], ministry: [], living: [mkPart('cbs', '會眾研經班', '30 分鐘', '主持/朗讀', true)] };
  const b = { date: '1/1', treasures: [], ministry: [], living: [mkPart('cbs', '會眾研經班', '30 分鐘', '主持/朗讀', false)] };
  const d = diffWeek(a, b);
  assert.equal(d.helperChanged.length, 1);
});

test('diffWeek hasChanges false when identical', () => {
  const a = { date: '1/1', treasures: [mkPart('t0', 'A', '10 分鐘')], ministry: [], living: [] };
  const b = { date: '1/1', treasures: [mkPart('t0', 'A', '10 分鐘')], ministry: [], living: [] };
  const d = diffWeek(a, b);
  assert.equal(d.hasChanges, false);
});

test('formatDiffLine no changes', () => {
  const a = { date: '1/1', treasures: [mkPart('t0', 'A', '10 分鐘')], ministry: [], living: [] };
  const b = { date: '1/1', treasures: [mkPart('t0', 'A', '10 分鐘')], ministry: [], living: [] };
  const d = diffWeek(a, b);
  assert.equal(formatDiffLine('12月 10日', d), '12/10：沒有修改');
});

test('formatDiffLine lists changes', () => {
  const d = diffWeek(existingWeek, incomingWeek);
  const line = formatDiffLine('12月 3日', d);
  assert.ok(line.startsWith('12/3：'));
  assert.ok(line.includes('新增 1 個節目'));
  // cleared clause hidden by default (keep mode)
  assert.ok(!line.includes('會清除'));
});

test('formatDiffLine shows cleared clause only in replace mode', () => {
  const d = diffWeek(existingWeek, incomingWeek);
  const line = formatDiffLine('12月 3日', d, { mode: 'replace' });
  assert.ok(line.includes('會清除 1 個指派'));
});

test('diffImport marks new weeks', () => {
  const existing = [existingWeek];
  const incoming = [incomingWeek, { date: '12月 17日', treasures: [], ministry: [], living: [] }];
  const res = diffImport(existing, incoming);
  assert.equal(res.length, 2);
  assert.equal(res[0].isNew, false);
  assert.equal(res[1].isNew, true);
  assert.ok(res[1].line.includes('新的週次'));
});

test('clearedAssignments counts added part assignments', () => {
  const d = diffWeek(existingWeek, incomingWeek);
  // x_abc has assign ['丁'] → 1 cleared
  assert.equal(d.clearedAssignments, 1);
});