import { HttpStatus, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { type ChangePasswordRequest, linkTokenSchema } from '@reih/contracts';
import { AppError, type ErrorCode, type RequestUser } from '../../../shared/http/index.js';
import { MailService } from '../../../shared/mail/index.js';
import { RESET_LINK_MINUTES, resetLinkExpiresAt, type LinkState } from '../domain/link-policy.js';
import { isLocked } from '../domain/login-policy.js';
import { hashPassword, PasswordHasher } from '../infrastructure/password-hasher.js';
import { PasswordResetRepository } from '../infrastructure/password-reset.repository.js';
import { UserRepository } from '../infrastructure/user.repository.js';
import { AccountLinks } from './account-links.js';
import { hashToken, newToken } from './tokens.js';

const RESET_REFUSAL: Record<Exclude<LinkState, 'pending'> | 'not_found', [ErrorCode, number]> = {
  not_found: ['RESET_LINK_INVALID', HttpStatus.BAD_REQUEST],
  // Never stored for a reset link; only invitations can be cancelled.
  cancelled: ['RESET_LINK_INVALID', HttpStatus.BAD_REQUEST],
  used: ['RESET_LINK_USED', HttpStatus.GONE],
  expired: ['RESET_LINK_EXPIRED', HttpStatus.GONE],
};

const currentPasswordIncorrect = () =>
  new AppError('CURRENT_PASSWORD_INCORRECT', HttpStatus.BAD_REQUEST);

/** FR-ACC-03: password reset by emailed link, and password change with the current password. */
@Injectable()
export class PasswordService implements OnApplicationShutdown {
  private readonly logger = new Logger(PasswordService.name);
  private readonly inFlight = new Set<Promise<void>>();

  constructor(
    private readonly users: UserRepository,
    private readonly resets: PasswordResetRepository,
    private readonly hasher: PasswordHasher,
    private readonly mail: MailService,
    private readonly links: AccountLinks,
  ) {}

  /**
   * POST /auth/forgot. Returns at once, before anything is looked up: the lookup, the token and the
   * email happen after the response, so a known and an unknown email take the same time and get
   * the same answer.
   */
  requestReset(email: string): void {
    const task = this.sendResetLink(email)
      .catch((error: unknown) => {
        this.logger.error({ msg: 'Password reset email failed', err: error });
      })
      .finally(() => this.inFlight.delete(task));
    this.inFlight.add(task);
  }

  /** Resolves when every reset request accepted so far is handled. Tests wait on it too. */
  async settled(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  /** Lets a reset request in progress finish before the database closes. */
  onApplicationShutdown(): Promise<void> {
    return this.settled();
  }

  private async sendResetLink(email: string): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    const user = await this.users.findByEmail(email);
    // Only an account that can log in today gets a link; others hear exactly the same.
    if (!user || user.status !== 'active' || user.passwordHash === null) {
      return;
    }
    const token = newToken();
    await this.resets.issue(user.id, hashToken(token), resetLinkExpiresAt(new Date()));
    await this.mail.send(email, 'passwordReset', user.prefLanguage, {
      actionUrl: this.links.passwordReset(user.role, user.prefLanguage, token),
      validMinutes: RESET_LINK_MINUTES,
    });
  }

  /** POST /auth/reset: once, within 60 minutes. Ends every session of the user. */
  async reset(token: string, password: string): Promise<void> {
    if (!linkTokenSchema.safeParse(token).success) {
      throw new AppError(...RESET_REFUSAL.not_found);
    }
    const tokenHash = hashToken(token);
    const found = await this.resets.findState(tokenHash, new Date());
    if (found !== 'pending') {
      throw new AppError(...RESET_REFUSAL[found]);
    }
    const passwordHash = await hashPassword(password);
    // Checked again under a lock: the link may have been used meanwhile.
    const state = await this.resets.reset(tokenHash, passwordHash, new Date());
    if (state !== 'pending') {
      throw new AppError(...RESET_REFUSAL[state]);
    }
  }

  /**
   * POST /me/password. A wrong current password counts as a failed login attempt, so a stolen
   * session cannot guess the password without the lockout. While locked, no guess is checked.
   * Success ends every other session of the user and keeps this one.
   */
  async change(user: RequestUser, request: ChangePasswordRequest): Promise<void> {
    const now = new Date();
    const credentials = await this.users.findCredentials(user.id);
    if (!credentials?.passwordHash || isLocked(credentials.lockedUntil, now)) {
      await this.hasher.verifyNothing(request.currentPassword);
      throw currentPasswordIncorrect();
    }
    if (!(await this.hasher.verify(request.currentPassword, credentials.passwordHash))) {
      await this.users.recordFailedLogin(user.id, now);
      throw currentPasswordIncorrect();
    }
    const passwordHash = await hashPassword(request.newPassword);
    await this.users.changePassword(user.id, passwordHash, new Date(), user.sessionId);
  }
}
