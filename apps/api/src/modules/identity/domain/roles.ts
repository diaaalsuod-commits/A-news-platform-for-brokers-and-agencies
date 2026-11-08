import { type UserRole, userRoleValues } from '@reih/contracts';

export const ALL_ROLES: readonly UserRole[] = userRoleValues;

/** Roles that belong to an agency; the others are staff of the company that runs REIH. */
export const AGENCY_ROLES: readonly UserRole[] = ['broker', 'agency_admin'];

export function isAgencyRole(role: UserRole): boolean {
  return AGENCY_ROLES.includes(role);
}

/** FR-ACC-04: an Agency Admin has every Broker right, so it passes any check that allows brokers. */
export function hasRequiredRole(role: UserRole, allowed: readonly UserRole[]): boolean {
  return allowed.includes(role) || (role === 'agency_admin' && allowed.includes('broker'));
}
