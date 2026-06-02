import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROLES, isSysadmin, isAdmin, canEdit, ASSIGNABLE_MEMBER_ROLES } from './roles.mjs';

test('canEdit: ADMIN and SYSADMIN may edit, VIEWER may not', () => {
  assert.equal(canEdit('SYSADMIN'), true);
  assert.equal(canEdit('ADMIN'), true);
  assert.equal(canEdit('VIEWER'), false);
  assert.equal(canEdit(undefined), false);
  assert.equal(canEdit('MEMBER'), false); // legacy value is no longer an editor
});

test('isSysadmin / isAdmin', () => {
  assert.equal(isSysadmin('SYSADMIN'), true);
  assert.equal(isSysadmin('ADMIN'), false);
  assert.equal(isAdmin('ADMIN'), true);
  assert.equal(isAdmin('SYSADMIN'), false);
  assert.equal(isAdmin('VIEWER'), false);
});

test('ROLES + assignable member roles (admins cannot grant SYSADMIN)', () => {
  assert.deepEqual(ROLES, { SYSADMIN: 'SYSADMIN', ADMIN: 'ADMIN', VIEWER: 'VIEWER' });
  assert.deepEqual(ASSIGNABLE_MEMBER_ROLES, ['ADMIN', 'VIEWER']);
  assert.ok(!ASSIGNABLE_MEMBER_ROLES.includes('SYSADMIN'));
});

// Security regression guard: every schedule-mutating route must enforce canEdit.
test('all mutating routes enforce the canEdit guard', () => {
  const routes = [
    '../api/assignments/route.js',
    '../api/weekend-rows/route.js',
    '../api/weekend-rows/[id]/route.js',
    '../api/midweek-weeks/[id]/route.js',
    '../api/midweek-weeks/import/route.js',
    '../api/people/[id]/route.js',
  ];
  for (const rel of routes) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(src.includes('canEdit(user.role)'), `${rel} must guard writes with canEdit`);
  }
  // people POST is guarded; people GET is intentionally open to viewers.
  const people = readFileSync(new URL('../api/people/route.js', import.meta.url), 'utf8');
  assert.ok(people.includes('canEdit(user.role)'), 'people POST must guard with canEdit');
});

// Sysadmin endpoints must require SYSADMIN.
test('admin routes require sysadmin', () => {
  for (const rel of [
    '../api/admin/data/route.js',
    '../api/admin/congregations/route.js',
    '../api/admin/congregations/[id]/route.js',
    '../api/admin/users/[id]/route.js',
  ]) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.ok(src.includes('isSysadmin'), `${rel} must gate on isSysadmin`);
  }
});
