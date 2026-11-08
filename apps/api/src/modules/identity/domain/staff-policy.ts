import type { UserRole, UserStatus } from '@reih/contracts';

/** FR-ADM-03: the roles of the company that runs REIH, which a Platform Admin manages. */
export const STAFF_ROLES = ['data_operator', 'platform_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: UserRole): role is StaffRole {
  return (STAFF_ROLES as readonly UserRole[]).includes(role);
}

export interface StaffTarget {
  id: string;
  role: UserRole;
  status: UserStatus;
  hasPassword: boolean;
}

export type StaffChange =
  { kind: 'deactivate' } | { kind: 'reactivate' } | { kind: 'change_role'; role: StaffRole };

export type StaffRefusal =
  | 'CANNOT_DEACTIVATE_SELF'
  | 'CANNOT_CHANGE_OWN_ROLE'
  | 'LAST_PLATFORM_ADMIN'
  | 'USER_NOT_ACTIVATED'
  | 'USER_ALREADY_ACTIVE'
  | 'USER_ALREADY_DEACTIVATED';

/**
 * FR-ADM-03: whether a Platform Admin may make this change to a staff member. activeAdminIds are the
 * active Platform Admins, read under a lock so that two changes at once cannot both remove the last
 * one. Returns null when the change is allowed, or 'unchanged' for a role change to the same role.
 */
export function staffChangeRefusal(
  actorId: string,
  target: StaffTarget,
  change: StaffChange,
  activeAdminIds: readonly string[],
): StaffRefusal | 'unchanged' | null {
  const removesAnActiveAdmin =
    target.role === 'platform_admin' &&
    target.status === 'active' &&
    (change.kind === 'deactivate' ||
      (change.kind === 'change_role' && change.role !== 'platform_admin'));
  const lastAdmin =
    removesAnActiveAdmin && activeAdminIds.filter((id) => id !== target.id).length === 0;

  switch (change.kind) {
    case 'deactivate':
      if (target.id === actorId) return 'CANNOT_DEACTIVATE_SELF';
      if (target.status === 'invited') return 'USER_NOT_ACTIVATED';
      if (target.status === 'deactivated') return 'USER_ALREADY_DEACTIVATED';
      return lastAdmin ? 'LAST_PLATFORM_ADMIN' : null;
    case 'reactivate':
      if (target.status === 'active') return 'USER_ALREADY_ACTIVE';
      // An invited user, or one deactivated before ever setting a password (the System seed
      // operator), has no account to reactivate.
      if (target.status === 'invited' || !target.hasPassword) return 'USER_NOT_ACTIVATED';
      return null;
    case 'change_role':
      if (target.id === actorId) return 'CANNOT_CHANGE_OWN_ROLE';
      // A pending invitation names its role; cancel it and invite again instead.
      if (target.status === 'invited') return 'USER_NOT_ACTIVATED';
      if (target.role === change.role) return 'unchanged';
      return lastAdmin ? 'LAST_PLATFORM_ADMIN' : null;
  }
}
