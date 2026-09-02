import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCandidates } from './candidates.mjs';
import { suggestMidweekWeek } from './suggest.js';
import { buildPastHistory } from './pastHistory.mjs';

// The picker and the star-suggest engine are two entry points to ONE decision.
// These tests pin them to the same answer; they diverged once already.
const REF = new Date(2026, 6, 1); // the slot being filled: 7/1/2026
const brother = (name, quals) => ({ name, g: 'M', quals, status: 'active' });

test('picker ranks 經文朗讀 on the whole 朗讀 family, exactly as the engine does', () => {
  // 甲 read at 研經班 42 days before the slot but has never done 經文朗讀;
  // 乙 last read (經文朗讀) 150 days ago. Per-cat recency would call 甲
  // "從未擔任此項" and rank him first — the family rule must rank 乙 first.
  const weeks = [
    { id: 9,  date: '5月 20日', treasures: [], ministry: [],
      living: [{ id: 'c0', cat: 'cbs', roleLabel: '主持/朗讀' }] },
    { id: 10, date: '2月 1日', ministry: [], living: [],
      treasures: [{ id: 't2', cat: 'reading', roleLabel: '學生' }] },
    { id: 11, date: '7月 1日', ministry: [], living: [],
      treasures: [{ id: 't2', cat: 'reading', roleLabel: '學生' }] },
  ];
  const assignments = { 'mw9_c0_1': '甲', 'mw10_t2_0': '乙' };
  const people = [brother('甲', ['經文朗讀', '研經班朗讀']), brother('乙', ['經文朗讀'])];

  const hist = buildPastHistory(weeks, assignments, [], REF);
  const ranked = buildCandidates(people, 'reading', false, 2, hist);
  assert.equal(ranked[0].n, '乙', '甲 read at 研經班 six weeks ago — he is not the freshest');
  assert.ok(ranked.find(c => c.n === '甲').viaFamily, '甲 must be flagged as having read recently');

  // …and the engine agrees on the same data.
  const engineHistory = [
    { name: '甲', cat: 'cbsread', date: '5月 20日' },
    { name: '乙', cat: 'reading', date: '2月 1日' },
  ];
  const res = suggestMidweekWeek(people, weeks[2], {}, engineHistory, REF);
  assert.equal(res['mw11_t2_0'], '乙', 'engine and picker must not disagree');
});

test('picker still labels a genuinely fresh candidate as the recommendation', () => {
  const people = [brother('甲', ['經文朗讀']), brother('乙', ['經文朗讀'])];
  const weeks = [{ id: 10, date: '6月 24日', ministry: [], living: [],
    treasures: [{ id: 't2', cat: 'reading', roleLabel: '學生' }] }];
  const hist = buildPastHistory(weeks, { 'mw10_t2_0': '甲' }, [], REF);
  const ranked = buildCandidates(people, 'reading', false, 2, hist);
  assert.equal(ranked[0].n, '乙');
  assert.equal(ranked[0].viaFamily, null, 'no family turn to report');
});

test('a cat in no family is unaffected by the family lookup', () => {
  const people = [brother('甲', ['傳道與生活主席']), brother('乙', ['傳道與生活主席'])];
  const weeks = [{ id: 10, date: '6月 24日', treasures: [], ministry: [], living: [] }];
  const hist = buildPastHistory(weeks, { 'mw10_chairman': '甲' }, [], REF);
  const ranked = buildCandidates(people, 'chairman', false, 2, hist);
  assert.equal(ranked[0].n, '乙');
  assert.equal(ranked.find(c => c.n === '甲').viaFamily, null);
});

test('the 先驅 nudge is the same in the picker as in the engine', () => {
  // Same tie as suggest.test.mjs: both entry points must prefer the 先驅.
  const week = { id: 1, treasures: [{ id: 't0', cat: 'treasures', roleLabel: '學生' }], ministry: [], living: [] };
  const people = [
    brother('甲', ['寶藏演講']),
    { ...brother('乙', ['寶藏演講']), appt: '先驅' },
  ];
  const weeks = [
    { id: 9, date: '5月 6日', ministry: [], living: [], treasures: [{ id: 't0', cat: 'treasures', roleLabel: '學生' }] },
    { id: 8, date: '5月 6日', ministry: [], living: [], treasures: [{ id: 't1', cat: 'treasures', roleLabel: '學生' }] },
  ];
  const assignments = { 'mw9_t0_0': '甲', 'mw8_t1_0': '乙' };

  const hist = buildPastHistory(weeks, assignments, [], REF);
  assert.equal(buildCandidates(people, 'treasures', false, 2, hist)[0].n, '乙');

  const engineHistory = [
    { name: '甲', cat: 'treasures', date: '5月 6日' },
    { name: '乙', cat: 'treasures', date: '5月 6日' },
  ];
  assert.equal(suggestMidweekWeek(people, week, {}, engineHistory, REF)['mw1_t0_0'], '乙');
});
