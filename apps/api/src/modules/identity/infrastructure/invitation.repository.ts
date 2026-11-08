import { Inject, Injectable } from '@nestjs/common';
import type { LangCode, UserRole, UserStatus } from '@reih/contracts';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { type LinkState, linkState } from '../domain/link-policy.js';
import { invitations, users } from './identity.schema.js';

export interface InvitationRow {
  id: string;
  userId: string;
  agencyId: string | null;
  email: string;
  role: UserRole;
  expiresAt: Date;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  userStatus: UserStatus;
  userLanguage: LangCode;
}

const invitationColumns = {
  id: invitations.id,
  userId: invitations.userId,
  agencyId: invitations.agencyId,
  email: invitations.email,
  role: invitations.role,
  expiresAt: invitations.expiresAt,
  acceptedAt: invitations.acceptedAt,
  cancelledAt: invitations.cancelledAt,
  userStatus: users.status,
  userLanguage: users.prefLanguage,
};

/** The state of an invitation, which the user's own state can end early (a deactivated user). */
export function invitationState(row: InvitationRow, now: Date): LinkState {
  const state = linkState({ ...row, usedAt: row.acceptedAt }, now);
  return state === 'pending' && row.userStatus !== 'invited' ? 'cancelled' : state;
}

@Injectable()
export class InvitationRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async findUserByEmail(email: string): Promise<{ id: string; status: UserStatus } | null> {
    const [row] = await this.db
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.email, email));
    return row ?? null;
  }

  async hasPendingInvitation(userId: string, now: Date): Promise<boolean> {
    const [row] = await this.db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.userId, userId),
          isNull(invitations.acceptedAt),
          isNull(invitations.cancelledAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .limit(1);
    return row !== undefined;
  }

  /**
   * Creates the invited user, or reuses one whose earlier invitations lapsed, and its invitation.
   * The unique email and the pending check run in one transaction under a row lock.
   */
  async create(input: {
    existingUserId: string | null;
    email: string;
    role: UserRole;
    agencyId: string | null;
    language: LangCode;
    invitedBy: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<{ invitationId: string; userId: string }> {
    return this.db.transaction(async (tx) => {
      let userId: string;
      if (input.existingUserId === null) {
        const [created] = await tx
          .insert(users)
          .values({
            email: input.email,
            role: input.role,
            agencyId: input.agencyId,
            status: 'invited',
            prefLanguage: input.language,
          })
          .returning({ id: users.id });
        userId = (created as { id: string }).id;
      } else {
        userId = input.existingUserId;
        await tx
          .update(users)
          .set({
            role: input.role,
            agencyId: input.agencyId,
            prefLanguage: input.language,
            updatedAt: input.now,
          })
          .where(and(eq(users.id, userId), eq(users.status, 'invited')));
      }

      const [invitation] = await tx
        .insert(invitations)
        .values({
          userId,
          agencyId: input.agencyId,
          email: input.email,
          role: input.role,
          tokenHash: input.tokenHash,
          invitedBy: input.invitedBy,
          expiresAt: input.expiresAt,
          lastSentAt: input.now,
        })
        .returning({ id: invitations.id });
      return { invitationId: (invitation as { id: string }).id, userId };
    });
  }

  async findById(id: string): Promise<InvitationRow | null> {
    const [row] = await this.db
      .select(invitationColumns)
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.userId))
      .where(eq(invitations.id, id));
    return row ?? null;
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationRow | null> {
    const [row] = await this.db
      .select(invitationColumns)
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.userId))
      .where(eq(invitations.tokenHash, tokenHash));
    return row ?? null;
  }

  /** Resend: a new token, so the old link stops working, and a new expiry. */
  async renew(id: string, tokenHash: string, expiresAt: Date, now: Date): Promise<void> {
    await this.db
      .update(invitations)
      .set({ tokenHash, expiresAt, lastSentAt: now, updatedAt: now })
      .where(eq(invitations.id, id));
  }

  async cancel(id: string, now: Date): Promise<void> {
    await this.db
      .update(invitations)
      .set({ cancelledAt: now, updatedAt: now })
      .where(eq(invitations.id, id));
  }

  /**
   * FR-ACC-01: uses the invitation once. Under a row lock, so two activations with the same link
   * cannot both succeed. Returns the state found, which is 'pending' when this call activated it.
   */
  async accept(
    tokenHash: string,
    account: { passwordHash: string; termsVersion: string },
    now: Date,
  ): Promise<LinkState | 'not_found'> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select(invitationColumns)
        .from(invitations)
        .innerJoin(users, eq(users.id, invitations.userId))
        .where(eq(invitations.tokenHash, tokenHash))
        .for('update');
      if (!row) {
        return 'not_found';
      }
      const state = invitationState(row, now);
      if (state !== 'pending') {
        return state;
      }
      await tx
        .update(invitations)
        .set({ acceptedAt: now, updatedAt: now })
        .where(eq(invitations.id, row.id));
      await tx
        .update(users)
        .set({
          passwordHash: account.passwordHash,
          status: 'active',
          termsVersion: account.termsVersion,
          termsAcceptedAt: now,
          failedLoginCount: 0,
          lockedUntil: null,
          updatedAt: now,
        })
        .where(eq(users.id, row.userId));
      return 'pending';
    });
  }
}
