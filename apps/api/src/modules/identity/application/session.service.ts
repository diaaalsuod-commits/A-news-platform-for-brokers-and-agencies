import { Injectable } from '@nestjs/common';
import type { RequestUser } from '../../../shared/http/index.js';
import { shouldTouch } from '../domain/session-policy.js';
import { SessionRepository } from '../infrastructure/session.repository.js';
import { hashToken, isWellFormedToken, newToken } from './tokens.js';

/** FR-ACC-02: server-side sessions; the database keeps only the SHA-256 of each token. */
@Injectable()
export class SessionService {
  constructor(private readonly sessions: SessionRepository) {}

  async start(
    userId: string,
    context: { ipAddress: string | null; userAgent: string | null },
    now: Date,
  ): Promise<string> {
    const token = newToken();
    await this.sessions.create({
      userId,
      tokenHash: hashToken(token),
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      now,
    });
    return token;
  }

  /**
   * The user behind a live session, or null. A session whose user is no longer active ends here, so
   * the result never depends on a listener having run. Activity moves the expiry forward.
   */
  async authenticate(token: string | undefined): Promise<RequestUser | null> {
    if (!isWellFormedToken(token)) {
      return null;
    }
    const now = new Date();
    const session = await this.sessions.findLive(hashToken(token), now);
    if (!session) {
      return null;
    }
    if (session.status !== 'active') {
      await this.sessions.end(session.sessionId, now);
      return null;
    }
    if (shouldTouch(session.lastActivityAt, now)) {
      await this.sessions.touch(session.sessionId, now);
    }
    return {
      id: session.userId,
      role: session.role,
      agencyId: session.agencyId,
      sessionId: session.sessionId,
    };
  }

  /** Logout: the session ends on the server. Unknown or ended tokens are ignored. */
  async end(token: string | undefined): Promise<void> {
    if (isWellFormedToken(token)) {
      await this.sessions.endByTokenHash(hashToken(token), new Date());
    }
  }

  endAllForUser(userId: string): Promise<number> {
    return this.sessions.endAllForUser(userId, new Date());
  }

  endAllForAgency(agencyId: string): Promise<number> {
    return this.sessions.endAllForAgency(agencyId, new Date());
  }
}
