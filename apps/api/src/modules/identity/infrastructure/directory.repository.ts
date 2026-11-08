import { Inject, Injectable } from '@nestjs/common';
import type { UserRole, UserStatus } from '@reih/contracts';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { containsPattern, DATABASE } from '../../../shared/database/index.js';
import {
  type AccountChange,
  type AccountRefusal,
  accountChangeRefusal,
  type KeeperRole,
  MEMBER_ROLES,
  STAFF_ROLES,
} from '../domain/account-policy.js';
import { invitations, users } from './identity.schema.js';

/**
 * Whose accounts an admin manages: the platform's staff (FR-ADM-03), or one agency's members
 * (FR-AGY-02 to FR-AGY-04). Every query below is limited to its scope.
 */
export interface DirectoryScope {
  roles: readonly UserRole[];
  /** Null for staff, who belong to no agency. */
  agencyId: string | null;
  keeperRole: KeeperRole;
}

export const STAFF_SCOPE: DirectoryScope = {
  roles: STAFF_ROLES,
  agencyId: null,
  keeperRole: 'platform_admin',
};

export function memberScope(agencyId: string): DirectoryScope {
  return { roles: MEMBER_ROLES, agencyId, keeperRole: 'agency_admin' };
}

export interface AccountRow {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface OpenInvitationRow {
  id: string;
  userId: string;
  email: string;
  role: UserRole;
  expiresAt: Date;
  lastSentAt: Date;
  createdAt: Date;
}

export type AccountChangeOutcome =
  | { outcome: 'not_found' }
  | { outcome: 'refused'; code: AccountRefusal }
  | { outcome: 'done'; changed: boolean };

const accountColumns = {
  id: users.id,
  email: users.email,
  fullName: users.fullName,
  role: users.role,
  status: users.status,
  lastLoginAt: users.lastLoginAt,
  createdAt: users.createdAt,
};

const openInvitationColumns = {
  id: invitations.id,
  userId: invitations.userId,
  email: invitations.email,
  role: invitations.role,
  expiresAt: invitations.expiresAt,
  lastSentAt: invitations.lastSentAt,
  createdAt: invitations.createdAt,
};

/** Not used and not cancelled, of a user who is still invited. It may have expired. */
const isOpenInvitation = and(
  isNull(invitations.acceptedAt),
  isNull(invitations.cancelledAt),
  eq(users.status, 'invited'),
);

/** The users of a scope: its roles, in its agency (or in none, for staff). */
function inScope(scope: DirectoryScope, roles: readonly UserRole[] = scope.roles): SQL {
  return and(
    inArray(users.role, [...roles]),
    scope.agencyId === null ? isNull(users.agencyId) : eq(users.agencyId, scope.agencyId),
  ) as SQL;
}

/** FR-ADM-03, FR-AGY-02 to FR-AGY-04: the accounts an admin manages. */
@Injectable()
export class DirectoryRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async list(
    scope: DirectoryScope,
    filter: { page: number; pageSize: number; q?: string; role?: UserRole; status?: UserStatus },
  ): Promise<{ items: AccountRow[]; total: number }> {
    const where = and(
      inScope(scope, filter.role ? [filter.role] : scope.roles),
      filter.status ? eq(users.status, filter.status) : undefined,
      filter.q
        ? or(
            ilike(users.email, containsPattern(filter.q)),
            ilike(users.fullName, containsPattern(filter.q)),
          )
        : undefined,
    );
    const [items, [totals]] = await Promise.all([
      this.db
        .select(accountColumns)
        .from(users)
        .where(where)
        .orderBy(asc(users.email))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(users).where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  async find(scope: DirectoryScope, userId: string): Promise<AccountRow | null> {
    const [row] = await this.db
      .select(accountColumns)
      .from(users)
      .where(and(eq(users.id, userId), inScope(scope)));
    return row ?? null;
  }

  /** The newest open invitation of each user. */
  async openInvitationsOf(userIds: string[]): Promise<Map<string, OpenInvitationRow>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.db
      .select(openInvitationColumns)
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.userId))
      .where(and(inArray(invitations.userId, userIds), isOpenInvitation))
      .orderBy(desc(invitations.createdAt));
    const newest = new Map<string, OpenInvitationRow>();
    for (const row of rows) {
      if (!newest.has(row.userId)) newest.set(row.userId, row);
    }
    return newest;
  }

  /** FR-ADM-01, FR-AGY-03: an agency's open invitations of these roles, newest first. */
  async openAgencyInvitations(
    agencyId: string,
    roles: readonly UserRole[],
    page: number,
    pageSize: number,
  ): Promise<{ items: OpenInvitationRow[]; total: number }> {
    const where = and(
      eq(invitations.agencyId, agencyId),
      inArray(invitations.role, [...roles]),
      isOpenInvitation,
    );
    const [items, [totals]] = await Promise.all([
      this.db
        .select(openInvitationColumns)
        .from(invitations)
        .innerJoin(users, eq(users.id, invitations.userId))
        .where(where)
        .orderBy(desc(invitations.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db
        .select({ total: count() })
        .from(invitations)
        .innerJoin(users, eq(users.id, invitations.userId))
        .where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  /**
   * FR-ADM-03, FR-AGY-04: one account change in one transaction. The scope's active keepers
   * (Platform Admins, or the agency's Agency Admins) are locked first, in id order, so two changes
   * at once run one after the other: the second one re-reads the rows after the first commits and
   * sees a keeper it removed as gone. A single conditional UPDATE would not do, because under READ
   * COMMITTED each would still count the other as active. The caller publishes MemberDeactivated
   * after a deactivation, and its listener ends the sessions.
   */
  async change(
    scope: DirectoryScope,
    actorId: string,
    userId: string,
    change: AccountChange,
    now: Date,
  ): Promise<AccountChangeOutcome> {
    return this.db.transaction(async (tx) => {
      const keepers = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(inScope(scope, [scope.keeperRole]), eq(users.status, 'active')))
        .orderBy(asc(users.id))
        .for('update');
      const [target] = await tx
        .select({
          id: users.id,
          role: users.role,
          status: users.status,
          passwordHash: users.passwordHash,
        })
        .from(users)
        .where(and(eq(users.id, userId), inScope(scope)))
        .for('update');
      if (!target) {
        return { outcome: 'not_found' };
      }

      const refusal = accountChangeRefusal(
        actorId,
        {
          id: target.id,
          role: target.role,
          status: target.status,
          hasPassword: target.passwordHash !== null,
        },
        change,
        keepers.map((keeper) => keeper.id),
        scope.keeperRole,
      );
      if (refusal === 'unchanged') {
        return { outcome: 'done', changed: false };
      }
      if (refusal !== null) {
        return { outcome: 'refused', code: refusal };
      }

      const set =
        change.kind === 'change_role'
          ? { role: change.role }
          : {
              status: change.kind === 'deactivate' ? ('deactivated' as const) : ('active' as const),
            };
      await tx
        .update(users)
        .set({ ...set, updatedAt: now })
        .where(eq(users.id, userId));
      return { outcome: 'done', changed: true };
    });
  }
}
