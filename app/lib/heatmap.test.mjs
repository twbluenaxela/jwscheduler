import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  serviceYearStartYear, parseServiceYearDate, collectPersonEvents,
  buildHeatmapRows, buildPersonDetail, buildPersonSummary,
} from './heatmap.mjs';

test('serviceYearStartYear picks the September the ref date is inside/after', () => {
  assert.equal(serviceYearStartYear(new Date(2026, 7, 21)), 2025); // Aug 2026 -> Sept 2025
  assert.equal(serviceYearStartYear(new Date(2025, 8, 1)), 2025);  // Sept 2025 -> Sept 2025
  assert.equal(serviceYearStartYear(new Date(2026, 0, 5)), 2025);  // Jan 2026 -> Sept 2025
});

test('parseServiceYearDate resolves the year across the Sept/Aug boundary', () => {
  assert.deepEqual(parseServiceYearDate('9月 16日', 2025), new Date(2025, 8, 16));
  assert.deepEqual(parseServiceYearDate('3月 3日', 2025), new Date(2026, 2, 3));
  assert.deepEqual(parseServiceYearDate('8/9', 2025), new Date(2026, 7, 9));
});

function week(id, date, over = {}) {
  return {
    id, date,
    chairman: over.chairman ?? '', openPrayer: '', closePrayer: '',
    treasures: [], ministry: over.ministry ?? [], living: [],
  };
}

test('collectPersonEvents pulls names from chairman + parts + weekend rows', () => {
  const weeks = [
    week(1, '9月 16日', { ministry: [
      { id: 'm0', title: '傳道示範', roleLabel: '學生/助手', assign: ['陳美惠', '張怡君'] },
    ] }),
  ];
  const weekendRows = [{ date: '9/21', type: 'schedule', speaker: '陳美惠' }];
  const evts = collectPersonEvents(weeks, {}, weekendRows, 2025);
  const chen = evts.get('陳美惠');
  assert.equal(chen.length, 2);
  assert.equal(chen[0].label, '傳道示範（學生）');
  assert.equal(chen[0].partner, '張怡君');
  assert.equal(chen[0].family, true);
  const chang = evts.get('張怡君');
  assert.equal(chang[0].label, '傳道示範（助手）');
  assert.equal(chang[0].partner, '陳美惠');
});

test('sister double-in-a-month flags on any two parts; brother only on ministry-family parts', () => {
  const weeks = [
    week(1, '3月 3日', { ministry: [{ id: 'm0', title: '傳道示範', roleLabel: '學生', assign: ['陳美惠'] }] }),
    week(2, '3月 17日', { ministry: [{ id: 'm1', title: '傳道討論', assign: [] }, { id: 't0', title: '寶藏演講', assign: [] }] }),
  ];
  weeks[1].treasures = [{ id: 't0', title: '寶藏演講', assign: ['林俊宏'] }];
  weeks[1].chairman = '';
  // second event for 陳美惠 same month (any type counts for sisters)
  weeks[1].openPrayer = '';
  const weeks2 = [...weeks, week(3, '3月 24日', {})];
  weeks2[2].closePrayer = '陳美惠';
  weeks2[2].living = [{ id: 'l0', title: '生活演講', assign: ['林俊宏'] }];

  const people = [{ name: '陳美惠', g: 'F' }, { name: '林俊宏', g: 'M' }];
  const { rows } = buildHeatmapRows(people, weeks2, {}, [], { refDate: new Date(2026, 5, 1) });
  const chen = rows.find((r) => r.person.name === '陳美惠');
  const lin = rows.find((r) => r.person.name === '林俊宏');
  assert.equal(chen.dbl, 1); // two different-type parts in March both count for a sister
  assert.equal(lin.dbl, 0);  // 寶藏演講 + 生活演講 aren't in the ministry-family bucket for a brother
});

test('idle flag fires on a long zero-assignment run scaled to the window', () => {
  const people = [{ name: '王小明', g: 'M' }];
  const { rows } = buildHeatmapRows(people, [], {}, [], { range: 6, refDate: new Date(2026, 7, 21) });
  const row = rows[0];
  assert.equal(row.idle, 6); // fully idle 6-month window >= max(3, round(6/2))=3
  assert.equal(row.rank, 1);
});

test('buildPersonDetail + buildPersonSummary produce a matching plain-language line', () => {
  const weeks = [
    week(1, '9月 16日', { ministry: [{ id: 'm0', title: '傳道示範', roleLabel: '學生', assign: ['陳美惠'] }] }),
  ];
  const detail = buildPersonDetail('陳美惠', 'F', weeks, {}, [], { refDate: new Date(2026, 5, 1) });
  assert.equal(detail.total, 1);
  const summary = buildPersonSummary('陳美惠', 'F', detail);
  assert.match(summary, /共有 1 份指派/);
});
