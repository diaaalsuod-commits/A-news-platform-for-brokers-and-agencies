import type { UserRole, UserStatus } from '@reih/contracts';

/** FR-ADM-03: the roles of the company that runs REIH, which a Platform Admin manages. */
export const STAFF_ROLES = ['data_operator', 'platform_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

/** FR-AGY-02 to FR-AGY-04: the roles of an agency, which its Agency Admin manages. */
export const MEMBER_ROLES = ['broker', 'agency_admin'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export function isStaffRole(role: UserRole): role is StaffRole {
  return (STAFF_ROLES as readonly UserRole[]).includes(role);
}

export function isMemberRole(role: UserRole): role is MemberRole {
  return (MEMBER_ROLES as readonly UserRole[]).includes(role);
}

/**
 * The role a scope must always keep one active user of: a Platform Admin for the platform
 * (FR-ADM-03), an Agency Admin for each agency (FR-AGY-04).
 */
export type KeeperRole = 'platform_admin' | 'agency_admin';

export interface AccountTarget {
  id: string;
  role: UserRole;
  status: UserStatus;
  hasPassword: boolean;
}

export type AccountChange =
  { kind: 'deactivate' } | { kind: 'reactivate' } | { kind: 'change_role'; role: UserRole };

export type AccountRefusal =
  | 'CANNOT_DEACTIVATE_SELF'
  | 'CANNOT_CHANGE_OWN_ROLE'
  | 'LAST_PLATFORM_ADMIN'
  | 'LAST_AGENCY_ADMIN'
  | 'USER_NOT_ACTIVATED'
  | 'USER_ALREADY_ACTIVE'
  | 'USER_ALREADY_DEACTIVATED';

const LAST_KEEPER: Record<KeeperRole, AccountRefusal> = {
  platform_admin: 'LAST_PLATFORM_ADMIN',
  agency_admin: 'LAST_AGENCY_ADMIN',
};

/**
 * FR-ADM-03, FR-AGY-04: whether an admin may make this change to an account in their scope.
 * activeKeeperIds are the scope's active users of keeperRole, read under a lock so that two changes
 * at once cannot both remove the last one. Returns null when the change is allowed, or 'unchanged'
 * for a role change to the same role.
 */
export function accountChangeRefusal(
  actorId: string,
  target: AccountTarget,
  change: AccountChange,
  activeKeeperIds: readonly string[],
  keeperRole: KeeperRole,
): AccountRefusal | 'unchanged' | null {
  const removesAnActiveKeeper =
    target.role === keeperRole &&
    target.status === 'active' &&
    (change.kind === 'deactivate' || (change.kind === 'change_role' && change.role !== keeperRole));
  const lastKeeper =
    removesAnActiveKeeper && activeKeeperIds.filter((id) => id !== target.id).length === 0;

  switch (change.kind) {
    case 'deactivate':
      if (target.id === actorId) return 'CANNOT_DEACTIVATE_SELF';
      if (target.status === 'invited') return 'USER_NOT_ACTIVATED';
      if (target.status === 'deactivated') return 'USER_ALREADY_DEACTIVATED';
      return lastKeeper ? LAST_KEEPER[keeperRole] : null;
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
      return lastKeeper ? LAST_KEEPER[keeperRole] : null;
  }
}
