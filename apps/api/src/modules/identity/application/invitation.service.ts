import { HttpStatus, Injectable } from '@nestjs/common';
import type { LangCode, UserRole } from '@reih/contracts';
import { isUniqueViolation } from '../../../shared/database/index.js';
import { AppError } from '../../../shared/http/index.js';
import { MailService } from '../../../shared/mail/index.js';
import {
  type Inviter,
  invitationExpiresAt,
  mayInvite,
  mayManageInvitation,
} from '../domain/link-policy.js';
import {
  type InvitationRow,
  InvitationRepository,
  invitationState,
} from '../infrastructure/invitation.repository.js';
import { UserRepository } from '../infrastructure/user.repository.js';
import { AccountLinks } from './account-links.js';
import { AgencyStatusPort, IdentitySettingsPort } from './ports.js';
import { hashToken, newToken } from './tokens.js';

export interface InviteResult {
  invitationId: string;
  userId: string;
}

/**
 * FR-ACC-01, FR-AGY-02, FR-ADM-01, FR-ADM-03: invitations. The agency and admin modules call it;
 * it checks who may invite whom itself, so no caller can forget to.
 */
@Injectable()
export class InvitationService {
  constructor(
    private readonly invitations: InvitationRepository,
    private readonly users: UserRepository,
    private readonly settings: IdentitySettingsPort,
    private readonly agencies: AgencyStatusPort,
    private readonly mail: MailService,
    private readonly links: AccountLinks,
  ) {}

  /**
   * Creates the invited user and its invitation, and emails the link. The email is in `language`,
   * by default the inviter's own, which also becomes the new user's language.
   *
   * Refuses an email that belongs to an active or a deactivated user (EMAIL_ALREADY_REGISTERED):
   * users are never deleted, and moving one to another agency would show it their earlier catalogs
   * and reveal logs. An email with a pending invitation is refused too (INVITATION_PENDING).
   */
  async invite(
    by: Inviter,
    email: string,
    role: UserRole,
    agencyId: string | null = null,
    language?: LangCode,
  ): Promise<InviteResult> {
    const normalisedEmail = email.trim().toLowerCase();
    if (!mayInvite(by, role, agencyId)) {
      throw new AppError('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    if (agencyId !== null && (await this.agencies.getSummary(agencyId)) === null) {
      throw new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
    }

    const now = new Date();
    const existing = await this.invitations.findUserByEmail(normalisedEmail);
    if (existing && existing.status !== 'invited') {
      throw new AppError('EMAIL_ALREADY_REGISTERED', HttpStatus.CONFLICT);
    }
    if (existing && (await this.invitations.hasPendingInvitation(existing.id, now))) {
      throw new AppError('INVITATION_PENDING', HttpStatus.CONFLICT);
    }

    const emailLanguage = language ?? (await this.inviterLanguage(by.id));
    const { invitationValidityDays } = await this.settings.get();
    const token = newToken();
    let result: InviteResult;
    try {
      result = await this.invitations.create({
        existingUserId: existing?.id ?? null,
        email: normalisedEmail,
        role,
        agencyId,
        language: emailLanguage,
        invitedBy: by.id,
        tokenHash: hashToken(token),
        expiresAt: invitationExpiresAt(now, invitationValidityDays),
        now,
      });
    } catch (error) {
      // Two invitations of the same new email at once: the unique email decides.
      if (isUniqueViolation(error)) {
        throw new AppError('INVITATION_PENDING', HttpStatus.CONFLICT);
      }
      throw error;
    }

    await this.send(normalisedEmail, role, emailLanguage, token, invitationValidityDays);
    return result;
  }

  /** A new link and a new expiry; the old link stops working. Only a pending invitation. */
  async resend(by: Inviter, invitationId: string): Promise<void> {
    const invitation = await this.pendingFor(by, invitationId);
    const now = new Date();
    const { invitationValidityDays } = await this.settings.get();
    const token = newToken();
    await this.invitations.renew(
      invitation.id,
      hashToken(token),
      invitationExpiresAt(now, invitationValidityDays),
      now,
    );
    await this.send(
      invitation.email,
      invitation.role,
      invitation.userLanguage,
      token,
      invitationValidityDays,
    );
  }

  async cancel(by: Inviter, invitationId: string): Promise<void> {
    const invitation = await this.pendingFor(by, invitationId);
    await this.invitations.cancel(invitation.id, new Date());
  }

  /**
   * The invitation, if the caller may manage it and it is neither used nor cancelled. An expired one
   * can still be resent or cancelled. Another agency's invitation is not found, so it stays hidden.
   */
  private async pendingFor(by: Inviter, invitationId: string): Promise<InvitationRow> {
    const invitation = await this.invitations.findById(invitationId);
    if (!invitation || !mayManageInvitation(by, invitation)) {
      throw new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const state = invitationState(invitation, new Date());
    if (state === 'used') throw new AppError('INVITATION_USED', HttpStatus.CONFLICT);
    if (state === 'cancelled') throw new AppError('INVITATION_CANCELLED', HttpStatus.CONFLICT);
    return invitation;
  }

  private async inviterLanguage(inviterId: string): Promise<LangCode> {
    return (await this.users.findProfile(inviterId))?.prefLanguage ?? 'en';
  }

  private send(
    email: string,
    role: UserRole,
    language: LangCode,
    token: string,
    validDays: number,
  ): Promise<void> {
    return this.mail.send(email, 'invitation', language, {
      actionUrl: this.links.activation(role, language, token),
      validDays,
    });
  }
}
