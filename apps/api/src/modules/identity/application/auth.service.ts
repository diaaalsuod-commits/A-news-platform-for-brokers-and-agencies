import { HttpStatus, Injectable } from '@nestjs/common';
import type { LoginRequest, MeResponse } from '@reih/contracts';
import { AppError } from '../../../shared/http/index.js';
import { isLocked } from '../domain/login-policy.js';
import { isAgencyRole } from '../domain/roles.js';
import { PasswordHasher } from '../infrastructure/password-hasher.js';
import { type LoginCandidate, UserRepository } from '../infrastructure/user.repository.js';
import { MeService } from './me.service.js';
import { SessionService } from './session.service.js';
import { AgencyStatusPort } from './ports.js';

export interface LoginContext {
  ipAddress: string | null;
  userAgent: string | null;
  /** The session cookie the browser still sent, if any. It ends, so a login always starts afresh. */
  previousToken: string | undefined;
}

/**
 * FR-ACC-02: every refusal looks the same, so the answer never says whether the email exists, the
 * account is locked, or the user or agency is inactive (UC-01.2 activity diagram, BR-13).
 */
const invalidCredentials = () => new AppError('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly agencies: AgencyStatusPort,
    private readonly sessions: SessionService,
    private readonly me: MeService,
  ) {}

  /** UC-01.2. Returns the new session token and the caller's account. */
  async login(
    credentials: LoginRequest,
    context: LoginContext,
  ): Promise<{ token: string; me: MeResponse }> {
    const now = new Date();
    const user = await this.users.findByEmail(credentials.email);

    if (!user || user.passwordHash === null || isLocked(user.lockedUntil, now)) {
      await this.hasher.verifyNothing(credentials.password);
      throw invalidCredentials();
    }
    if (!(await this.hasher.verify(credentials.password, user.passwordHash))) {
      await this.users.recordFailedLogin(user.id, now);
      throw invalidCredentials();
    }
    if (!(await this.mayLogIn(user))) {
      throw invalidCredentials();
    }

    if (context.previousToken !== undefined) {
      await this.sessions.end(context.previousToken);
    }
    const token = await this.sessions.start(user.id, context, now);
    await this.users.recordLogin(user.id, now);
    return { token, me: await this.me.get(user.id) };
  }

  /** Only active users; an agency's member also needs an agency, and it must be active (BR-13). */
  private async mayLogIn(user: LoginCandidate): Promise<boolean> {
    if (user.status !== 'active') {
      return false;
    }
    if (!isAgencyRole(user.role)) {
      return true;
    }
    return user.agencyId !== null && (await this.agencies.isActive(user.agencyId));
  }
}
