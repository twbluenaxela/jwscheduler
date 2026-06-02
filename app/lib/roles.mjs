// Role model: SYSADMIN (global control) > ADMIN (the only per-congregation editor)
// > VIEWER (read-only; sees schedule + people). One source of truth, used by both
// route guards and UI gating.

export const ROLES = { SYSADMIN: 'SYSADMIN', ADMIN: 'ADMIN', VIEWER: 'VIEWER' };

export function isSysadmin(role) { return role === ROLES.SYSADMIN; }
export function isAdmin(role) { return role === ROLES.ADMIN; }

// May this role create/update/delete a congregation's schedule data?
// Only admins and sysadmins — viewers are read-only.
export function canEdit(role) { return role === ROLES.ADMIN || role === ROLES.SYSADMIN; }

// May this role manage a congregation's settings/members/invite links + see the
// change log? Admins (their own congregation) and sysadmins (any).
export function canManageCongregation(role) { return role === ROLES.ADMIN || role === ROLES.SYSADMIN; }

// Roles a congregation ADMIN may assign to members (cannot grant SYSADMIN).
export const ASSIGNABLE_MEMBER_ROLES = [ROLES.ADMIN, ROLES.VIEWER];
