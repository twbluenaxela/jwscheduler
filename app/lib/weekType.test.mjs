import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MIDWEEK_TYPES,
  MIDWEEK_TYPE_LABELS,
  isMidweekSuspended,
  midweekType,
  suggestTypeFromLabel,
  suspendedNotice,
  countScheduledWeeks,
} from './weekType.mjs';

test('every type has a chip label', () => {
  for (const type of MIDWEEK_TYPES) {
    assert.equal(typeof MIDWEEK_TYPE_LABELS[type], 'string');
    assert.ok(MIDWEEK_TYPE_LABELS[type].length > 0);
  }
});

test('midweekType falls back to normal for missing or unknown values', () => {
  assert.equal(midweekType(undefined), 'normal');
  assert.equal(midweekType({}), 'normal');
  assert.equal(midweekType({ type: '' }), 'normal');
  assert.equal(midweekType({ type: 'nonsense' }), 'normal');
  assert.equal(midweekType({ type: 'suspended' }), 'suspended');
});

test('assembly and suspended both mean the midweek is cancelled', () => {
  assert.equal(isMidweekSuspended({ type: 'assembly' }), true);
  assert.equal(isMidweekSuspended({ type: 'suspended' }), true);
});

test('normal and special weeks still have a meeting', () => {
  // 特別 covers 分區監督探訪 — the programme changes, the meeting still happens.
  assert.equal(isMidweekSuspended({ type: 'normal' }), false);
  assert.equal(isMidweekSuspended({ type: 'special' }), false);
  assert.equal(isMidweekSuspended({}), false);
});

test('label keywords suggest a type', () => {
  assert.equal(suggestTypeFromLabel('國際大會'), 'suspended');
  assert.equal(suggestTypeFromLabel('區域大會'), 'suspended');
  assert.equal(suggestTypeFromLabel('分區大會'), 'suspended');
  assert.equal(suggestTypeFromLabel('總部代表'), 'suspended');
  assert.equal(suggestTypeFromLabel('2026 區域大會「保持警醒！」'), 'suspended');
});

test('分區監督探訪 suggests 特別, not 暫停', () => {
  // It contains 分區 but not 分區大會; the meeting happens with a modified
  // programme, so it must not be collapsed to a notice.
  assert.equal(suggestTypeFromLabel('分區監督探訪'), 'special');
  assert.equal(suggestTypeFromLabel('特別演講'), 'special');
});

test('no keyword, no suggestion', () => {
  assert.equal(suggestTypeFromLabel(''), null);
  assert.equal(suggestTypeFromLabel('   '), null);
  assert.equal(suggestTypeFromLabel(undefined), null);
  assert.equal(suggestTypeFromLabel('慶祝受難紀念聚會'), null);
});

test('suspendedNotice names the reason when there is one', () => {
  assert.equal(suspendedNotice({ label: '國際大會' }), '本週聚會暫停 — 國際大會');
  assert.equal(suspendedNotice({ label: '  ' }), '本週聚會暫停');
  assert.equal(suspendedNotice({}), '本週聚會暫停');
});

test('countScheduledWeeks ignores cancelled weeks', () => {
  const weeks = [
    { type: 'normal' },
    { type: 'suspended' },
    { type: 'special' },
    { type: 'assembly' },
    {},
  ];
  assert.equal(countScheduledWeeks(weeks), 3);
  assert.equal(countScheduledWeeks([]), 0);
  assert.equal(countScheduledWeeks(undefined), 0);
});
