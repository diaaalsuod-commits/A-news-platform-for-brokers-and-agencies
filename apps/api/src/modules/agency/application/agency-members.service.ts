import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  ChangeMemberStatusRequest,
  InvitationListResponse,
  InviteMemberRequest,
  InviteResponse,
  Member,
  MemberListQuery,
  MemberListResponse,
  MemberRole,
  PageQuery,
} from '@reih/contracts';
import { InvitationService, type Inviter, UserDirectory } from '../../identity/index.js';
import { AppError } from '../../../shared/http/index.js';

/**
 * FR-AGY-02 to FR-AGY-04, UC-04.2 to UC-04.7: the Agency Admin's team. Users and invitations are
 * identity's tables, so every operation goes through its public UserDirectory and
 * InvitationService, which scope it to the caller's own agency themselves.
 *
 * Kept apart from AgencyService on purpose: AgencyService backs identity's AgencyStatusPort and
 * must never depend on an identity provider (docs/decisions.md, P3.1).
 */
@Injectable()
export class AgencyMembersService {
  constructor(
    private readonly directory: UserDirectory,
    private readonly invitations: InvitationService,
  ) {}

  listMembers(by: Inviter, query: MemberListQuery): Promise<MemberListResponse> {
    return this.directory.listMembers(by, query);
  }

  getMember(by: Inviter, memberId: string): Promise<Member> {
    return this.directory.getMember(by, memberId);
  }

  listInvitations(by: Inviter, query: PageQuery): Promise<InvitationListResponse> {
    return this.directory.listMemberInvitations(by, query);
  }

  /**
   * FR-AGY-02: into the caller's own agency only, as Broker or Agency Admin. An email that already
   * has an account, in this agency or another, is refused (EMAIL_ALREADY_REGISTERED): a user
   * belongs to one agency.
   */
  invite(by: Inviter, input: InviteMemberRequest): Promise<InviteResponse> {
    return this.invitations.invite(by, input.email, input.role, this.agencyOf(by), input.language);
  }

  /** Another agency's invitation is not found (InvitationService checks it). */
  resend(by: Inviter, invitationId: string): Promise<void> {
    return this.invitations.resend(by, invitationId);
  }

  cancel(by: Inviter, invitationId: string): Promise<void> {
    return this.invitations.cancel(by, invitationId);
  }

  /** FR-AGY-04, UC-04.6. */
  changeRole(by: Inviter, memberId: string, role: MemberRole): Promise<Member> {
    return this.directory.changeMemberRole(by, memberId, role);
  }

  /** FR-AGY-04, UC-04.7: deactivation ends the member's sessions at once. */
  setStatus(by: Inviter, memberId: string, { status }: ChangeMemberStatusRequest): Promise<Member> {
    return this.directory.setMemberStatus(by, memberId, status);
  }

  private agencyOf(by: Inviter): string {
    if (by.role !== 'agency_admin' || by.agencyId === null) {
      throw new AppError('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return by.agencyId;
  }
}
