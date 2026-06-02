import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestMidweekWeek, suggestWeekendRow } from './suggest.js';

// Assigning for a meeting on 7/1/2026.
const REF = new Date(2026, 6, 1);
const emptyWeek = { id: 1, treasures: [], ministry: [], living: [] };

const brother = (name, quals) => ({ name, g: 'M', quals, status: 'active' });

test('suggests a 傳道與生活主席-qualified brother for chairman (not legacy 主席)', () => {
  // Regression: after the 主席 split migration, members carry 傳道與生活主席, not 主席.
  // The old engine filtered by 主席 and suggested nobody.
  const people = [brother('甲', ['傳道與生活主席'])];
  const res = suggestMidweekWeek(people, emptyWeek, {}, [], REF);
  assert.equal(res['mw1_chairman'], '甲');
});

test('weekend chair uses 週末聚會主席 and wt uses 守望台主持人 (split tags)', () => {
  const people = [
    brother('講者', ['公眾演講']),
    brother('主席甲', ['週末聚會主席']),
    brother('守望甲', ['守望台主持人']),
    brother('朗讀甲', ['守望台朗讀']),
  ];
  const res = suggestWeekendRow(people, [], {}, REF);
  assert.equal(res.speaker, '講者');
  assert.equal(res.chair, '主席甲');
  assert.equal(res.wt, '守望甲');
  assert.equal(res.read, '朗讀甲');
});

test('prefers the never-served candidate (longest gap) for chairman', () => {
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const history = [{ name: '甲', cat: 'chairman', date: '6月 3日' }]; // 甲 served, 乙 never
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '乙');
});

test('ignores assignments dated on/after refDate (past-only)', () => {
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const history = [
    { name: '甲', cat: 'chairman', date: '8月 1日' }, // after 7/1 → excluded → 甲 never-served
    { name: '乙', cat: 'chairman', date: '6月 3日' }, // before 7/1 → 乙 daysSince 28
  ];
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '甲', 'future assignment must not count against 甲');
});

test('daysSince measured from refDate: earlier server preferred over recent server', () => {
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const history = [
    { name: '甲', cat: 'chairman', date: '6月 24日' }, // 7 days before ref
    { name: '乙', cat: 'chairman', date: '5月 6日' },  // 56 days before ref
  ];
  const res = suggestMidweekWeek(people, emptyWeek, {}, history, REF);
  assert.equal(res['mw1_chairman'], '乙', 'longest gap before refDate wins');
});

test('midweek part suggestion fills treasures slot from section array', () => {
  const week = {
    id: 2,
    treasures: [{ id: 't0', cat: 'treasures', roleLabel: '' }],
    ministry: [],
    living: [],
  };
  const people = [brother('楊家松', ['寶藏演講'])];
  const res = suggestMidweekWeek(people, week, {}, [], REF);
  assert.equal(res['mw2_t0_0'], '楊家松');
});

test('does not suggest for already-filled slots', () => {
  const people = [brother('甲', ['傳道與生活主席'])];
  const res = suggestMidweekWeek(people, emptyWeek, { 'mw1_chairman': '已指派' }, [], REF);
  assert.equal(res['mw1_chairman'], undefined);
});
