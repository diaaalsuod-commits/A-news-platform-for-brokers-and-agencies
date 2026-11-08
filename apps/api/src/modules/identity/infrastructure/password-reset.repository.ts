import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { type LinkState, linkState } from '../domain/link-policy.js';
import { passwordResetTokens, sessions, users } from './identity.schema.js';

@Injectable()
export class PasswordResetRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** A new link voids the user's earlier unused ones: only the latest request works. */
  async issue(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(passwordResetTokens)
        .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
      await tx.insert(passwordResetTokens).values({ userId, tokenHash, expiresAt });
    });
  }

  async findState(tokenHash: string, now: Date): Promise<LinkState | 'not_found'> {
    const [row] = await this.db
      .select({
        expiresAt: passwordResetTokens.expiresAt,
        usedAt: passwordResetTokens.usedAt,
        userStatus: users.status,
      })
      .from(passwordResetTokens)
      .innerJoin(users, eq(users.id, passwordResetTokens.userId))
      .where(eq(passwordResetTokens.tokenHash, tokenHash));
    if (!row) return 'not_found';
    return row.userStatus === 'active' ? linkState(row, now) : 'not_found';
  }

  /**
   * FR-ACC-03: uses the link once, under a row lock. Sets the password, clears the failed attempts
   * and the lock, and ends every session of the user, in one transaction. Returns the state found;
   * 'pending' means this call reset the password.
   */
  async reset(
    tokenHash: string,
    passwordHash: string,
    now: Date,
  ): Promise<LinkState | 'not_found'> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .select({
          id: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
          expiresAt: passwordResetTokens.expiresAt,
          usedAt: passwordResetTokens.usedAt,
          userStatus: users.status,
        })
        .from(passwordResetTokens)
        .innerJoin(users, eq(users.id, passwordResetTokens.userId))
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .for('update');
      if (!row || row.userStatus !== 'active') {
        return 'not_found';
      }
      const state = linkState(row, now);
      if (state !== 'pending') {
        return state;
      }
      await tx
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(eq(passwordResetTokens.id, row.id));
      await tx
        .update(users)
        .set({ passwordHash, failedLoginCount: 0, lockedUntil: null, updatedAt: now })
        .where(eq(users.id, row.userId));
      await tx
        .update(sessions)
        .set({ endedAt: now })
        .where(and(eq(sessions.userId, row.userId), isNull(sessions.endedAt)));
      return 'pending';
    });
  }
}
