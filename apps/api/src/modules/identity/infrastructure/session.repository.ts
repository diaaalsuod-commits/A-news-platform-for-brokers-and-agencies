import { Inject, Injectable } from '@nestjs/common';
import type { UserRole, UserStatus } from '@reih/contracts';
import { and, eq, gt, inArray, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { sessionExpiresAt } from '../domain/session-policy.js';
import { sessions, users } from './identity.schema.js';

export interface LiveSession {
  sessionId: string;
  lastActivityAt: Date;
  userId: string;
  role: UserRole;
  status: UserStatus;
  agencyId: string | null;
}

@Injectable()
export class SessionRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async create(input: {
    userId: string;
    tokenHash: string;
    ipAddress: string | null;
    userAgent: string | null;
    now: Date;
  }): Promise<string> {
    const [row] = await this.db
      .insert(sessions)
      .values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        lastActivityAt: input.now,
        expiresAt: sessionExpiresAt(input.now),
      })
      .returning({ id: sessions.id });
    return (row as { id: string }).id;
  }

  /** A session that is neither ended nor expired, with its user. */
  async findLive(tokenHash: string, now: Date): Promise<LiveSession | null> {
    const [row] = await this.db
      .select({
        sessionId: sessions.id,
        lastActivityAt: sessions.lastActivityAt,
        userId: users.id,
        role: users.role,
        status: users.status,
        agencyId: users.agencyId,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.endedAt),
          gt(sessions.expiresAt, now),
        ),
      );
    return row ?? null;
  }

  /** Sliding expiry (FR-ACC-02). */
  async touch(sessionId: string, now: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ lastActivityAt: now, expiresAt: sessionExpiresAt(now) })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.endedAt)));
  }

  async end(sessionId: string, now: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ endedAt: now })
      .where(and(eq(sessions.id, sessionId), isNull(sessions.endedAt)));
  }

  async endByTokenHash(tokenHash: string, now: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ endedAt: now })
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.endedAt)));
  }

  /** FR-AGY-04: a deactivated member's sessions end at once. */
  async endAllForUser(userId: string, now: Date): Promise<number> {
    const ended = await this.db
      .update(sessions)
      .set({ endedAt: now })
      .where(and(eq(sessions.userId, userId), isNull(sessions.endedAt)))
      .returning({ id: sessions.id });
    return ended.length;
  }

  /** FR-ADM-02, BR-13: the sessions of a suspended agency's members end at once. */
  async endAllForAgency(agencyId: string, now: Date): Promise<number> {
    const members = this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.agencyId, agencyId));
    const ended = await this.db
      .update(sessions)
      .set({ endedAt: now })
      .where(and(inArray(sessions.userId, members), isNull(sessions.endedAt)))
      .returning({ id: sessions.id });
    return ended.length;
  }
}
