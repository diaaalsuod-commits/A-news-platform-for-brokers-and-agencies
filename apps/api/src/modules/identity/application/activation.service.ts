import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type ActivateRequest,
  type InvitationCheckResponse,
  linkTokenSchema,
} from '@reih/contracts';
import { AppError, type ErrorCode } from '../../../shared/http/index.js';
import type { LinkState } from '../domain/link-policy.js';
import { InvitationRepository, invitationState } from '../infrastructure/invitation.repository.js';
import { hashPassword } from '../infrastructure/password-hasher.js';
import { hashToken } from './tokens.js';
import { IdentitySettingsPort } from './ports.js';

/** FR-ACC-01: a refused link names why, so the person knows what to ask for. */
const REFUSAL: Record<Exclude<LinkState, 'pending'> | 'not_found', [ErrorCode, number]> = {
  not_found: ['INVITATION_NOT_FOUND', HttpStatus.NOT_FOUND],
  cancelled: ['INVITATION_CANCELLED', HttpStatus.GONE],
  used: ['INVITATION_USED', HttpStatus.GONE],
  expired: ['INVITATION_EXPIRED', HttpStatus.GONE],
};

const refuse = (state: Exclude<LinkState, 'pending'> | 'not_found') =>
  new AppError(...REFUSAL[state]);

/** UC-01.1 Activate Account. */
@Injectable()
export class ActivationService {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly settings: IdentitySettingsPort,
  ) {}

  /** GET /auth/invitations/:token: whether the link still works, and what the page shows. */
  async check(token: string): Promise<InvitationCheckResponse> {
    const invitation = linkTokenSchema.safeParse(token).success
      ? await this.invitations.findByTokenHash(hashToken(token))
      : null;
    if (!invitation) {
      throw refuse('not_found');
    }
    const state = invitationState(invitation, new Date());
    if (state !== 'pending') {
      throw refuse(state);
    }
    const { currentTermsVersion } = await this.settings.get();
    return {
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      termsVersion: currentTermsVersion,
    };
  }

  /**
   * Sets the password, activates the user and records the accepted terms version and time. The
   * link is checked first, so an expired link says so even when the terms box was left empty.
   */
  async activate(request: ActivateRequest): Promise<void> {
    await this.check(request.token);
    if (request.acceptTerms !== true) {
      throw new AppError('TERMS_NOT_ACCEPTED', HttpStatus.BAD_REQUEST);
    }
    const { currentTermsVersion } = await this.settings.get();
    const passwordHash = await hashPassword(request.password);
    // Checked again under a lock: the link may have been used meanwhile.
    const state = await this.invitations.accept(
      hashToken(request.token),
      { passwordHash, termsVersion: currentTermsVersion },
      new Date(),
    );
    if (state !== 'pending') {
      throw refuse(state);
    }
  }
}
