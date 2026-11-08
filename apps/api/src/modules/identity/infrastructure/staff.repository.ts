import { Inject, Injectable } from '@nestjs/common';
import type { UserRole, UserStatus } from '@reih/contracts';
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { containsPattern, DATABASE } from '../../../shared/database/index.js';
import {
  type StaffChange,
  type StaffRefusal,
  STAFF_ROLES,
  type StaffRole,
  staffChangeRefusal,
} from '../domain/staff-policy.js';
import { invitations, users } from './identity.schema.js';

export interface StaffRow {
  id: string;
  email: string;
  fullName: string | null;
  role: StaffRole;
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

export type StaffChangeOutcome =
  | { outcome: 'not_found' }
  | { outcome: 'refused'; code: StaffRefusal }
  | { outcome: 'done'; changed: boolean };

const staffColumns = {
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

/** FR-ADM-03: staff accounts (Data Operators and Platform Admins), for the Platform Admin. */
@Injectable()
export class StaffRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async list(filter: {
    page: number;
    pageSize: number;
    q?: string;
    role?: StaffRole;
    status?: UserStatus;
  }): Promise<{ items: StaffRow[]; total: number }> {
    const conditions: (SQL | undefined)[] = [
      filter.role ? eq(users.role, filter.role) : inArray(users.role, [...STAFF_ROLES]),
      filter.status ? eq(users.status, filter.status) : undefined,
      filter.q
        ? or(
            ilike(users.email, containsPattern(filter.q)),
            ilike(users.fullName, containsPattern(filter.q)),
          )
        : undefined,
    ];
    const where = and(...conditions);
    const [items, [totals]] = await Promise.all([
      this.db
        .select(staffColumns)
        .from(users)
        .where(where)
        .orderBy(asc(users.email))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(users).where(where),
    ]);
    return { items: items as StaffRow[], total: totals?.total ?? 0 };
  }

  async findStaff(userId: string): Promise<StaffRow | null> {
    const [row] = await this.db
      .select(staffColumns)
      .from(users)
      .where(and(eq(users.id, userId), inArray(users.role, [...STAFF_ROLES])));
    return (row as StaffRow | undefined) ?? null;
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

  /** FR-ADM-01: the open invitations of an agency's Agency Admins, newest first. */
  async openAgencyAdminInvitations(
    agencyId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: OpenInvitationRow[]; total: number }> {
    const where = and(
      eq(invitations.agencyId, agencyId),
      eq(invitations.role, 'agency_admin'),
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
   * FR-ADM-03: one staff change in one transaction. The active Platform Admins are locked first, in
   * id order, so two changes at once run one after the other: the second one re-reads the rows
   * after the first commits and sees an admin it deactivated as gone. A single conditional UPDATE
   * would not do, because under READ COMMITTED each would still count the other admin as active.
   * The caller publishes MemberDeactivated after a deactivation, and its listener ends the sessions.
   */
  async change(
    actorId: string,
    userId: string,
    change: StaffChange,
    now: Date,
  ): Promise<StaffChangeOutcome> {
    return this.db.transaction(async (tx) => {
      const admins = await tx
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.role, 'platform_admin'), eq(users.status, 'active')))
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
        .where(and(eq(users.id, userId), inArray(users.role, [...STAFF_ROLES])))
        .for('update');
      if (!target) {
        return { outcome: 'not_found' };
      }

      const refusal = staffChangeRefusal(
        actorId,
        {
          id: target.id,
          role: target.role,
          status: target.status,
          hasPassword: target.passwordHash !== null,
        },
        change,
        admins.map((admin) => admin.id),
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
