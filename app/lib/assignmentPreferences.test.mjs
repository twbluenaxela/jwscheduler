import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignmentIntervalInfo,
  normalizeAssignmentIntervalMonths,
} from './assignmentPreferences.mjs';

test('normalizes assignment intervals to a safe integer range', () => {
  assert.equal(normalizeAssignmentIntervalMonths('5'), 5);
  assert.equal(normalizeAssignmentIntervalMonths(-2), 0);
  assert.equal(normalizeAssignmentIntervalMonths(99), 24);
  assert.equal(normalizeAssignmentIntervalMonths('not-a-number'), 0);
});

test('reports when a person is still inside their preferred interval', () => {
  assert.deepEqual(
    assignmentIntervalInfo({ assignmentIntervalMonths: 5 }, 90),
    { months: 5, nearestGapDays: 90, targetDays: 150, daysRemaining: 60 },
  );
  assert.equal(assignmentIntervalInfo({ assignmentIntervalMonths: 5 }, 150), null);
  assert.equal(assignmentIntervalInfo({ assignmentIntervalMonths: 0 }, 1), null);
});
