import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  InvitationListResponse,
  InvitationSummary,
  Member,
  MemberListQuery,
  MemberListResponse,
  MemberRole,
  PageQuery,
  StaffListQuery,
  StaffListResponse,
  StaffMember,
  StaffRole,
  UserRole,
} from '@reih/contracts';
import { EventBus, MemberDeactivated } from '../../../shared/events/index.js';
import { AppError } from '../../../shared/http/index.js';
import { type AccountChange, MEMBER_ROLES } from '../domain/account-policy.js';
import type { Inviter } from '../domain/link-policy.js';
import {
  type AccountRow,
  type DirectoryScope,
  DirectoryRepository,
  memberScope,
  type OpenInvitationRow,
  STAFF_SCOPE,
} from '../infrastructure/directory.repository.js';
import { AgencyStatusPort } from './ports.js';

function summary(row: OpenInvitationRow, now: Date): InvitationSummary {
  return {
    id: row.id,
    userId: row.userId,
    email: row.email,
    role: row.role,
    state: row.expiresAt.getTime() <= now.getTime() ? 'expired' : 'pending',
    expiresAt: row.expiresAt.toISOString(),
    lastSentAt: row.lastSentAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** The account in the shape both lists share; the role is narrowed by the scope it came from. */
function account<R extends UserRole>(
  row: AccountRow,
  invitation: OpenInvitationRow | undefined,
  now: Date,
) {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role as R,
    status: row.status,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    pendingInvitation: invitation ? summary(invitation, now) : null,
  };
}

const notFound = () => new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
const forbidden = () => new AppError('FORBIDDEN', HttpStatus.FORBIDDEN);

/**
 * Identity's public directory of users. Like InvitationService, it checks the caller itself.
 * FR-ADM-03: the Platform Admin's staff. FR-AGY-02 to FR-AGY-04: an Agency Admin's own agency,
 * which always comes from the caller, never from a request; another agency's user is not found.
 */
@Injectable()
export class UserDirectory {
  constructor(
    private readonly directory: DirectoryRepository,
    private readonly events: EventBus,
    private readonly agencies: AgencyStatusPort,
  ) {}

  // ---------------------------------------------------------------- staff (FR-ADM-03)

  async listStaff(by: Inviter, query: StaffListQuery): Promise<StaffListResponse> {
    return this.list<StaffRole>(this.staffScope(by), query);
  }

  async getStaff(by: Inviter, userId: string): Promise<StaffMember> {
    return this.get<StaffRole>(this.staffScope(by), userId);
  }

  /** FR-ADM-01: an agency's open Agency Admin invitations, so they can be resent or cancelled. */
  async listAgencyAdminInvitations(
    by: Inviter,
    agencyId: string,
    query: PageQuery,
  ): Promise<InvitationListResponse> {
    this.staffScope(by);
    return this.invitationsOf(agencyId, ['agency_admin'], query);
  }

  /** The role is read on every request, so the change applies at once. */
  changeRole(by: Inviter, userId: string, role: StaffRole): Promise<StaffMember> {
    return this.apply<StaffRole>(this.staffScope(by), by, userId, { kind: 'change_role', role });
  }

  /** Publishes MemberDeactivated; its listener ends the user's sessions. */
  deactivate(by: Inviter, userId: string): Promise<StaffMember> {
    return this.apply<StaffRole>(this.staffScope(by), by, userId, { kind: 'deactivate' });
  }

  reactivate(by: Inviter, userId: string): Promise<StaffMember> {
    return this.apply<StaffRole>(this.staffScope(by), by, userId, { kind: 'reactivate' });
  }

  // ---------------------------------------------------------------- agency members (FR-AGY-02 to 04)

  /** FR-AGY-03: only the caller's own agency. */
  listMembers(by: Inviter, query: MemberListQuery): Promise<MemberListResponse> {
    return this.list<MemberRole>(this.memberScope(by), query);
  }

  getMember(by: Inviter, userId: string): Promise<Member> {
    return this.get<MemberRole>(this.memberScope(by), userId);
  }

  /** FR-AGY-03: the agency's open Broker and Agency Admin invitations. */
  listMemberInvitations(by: Inviter, query: PageQuery): Promise<InvitationListResponse> {
    const scope = this.memberScope(by);
    return this.invitationsOf(scope.agencyId as string, MEMBER_ROLES, query);
  }

  /** FR-AGY-04: refused for oneself and when the agency would keep no active Agency Admin. */
  changeMemberRole(by: Inviter, userId: string, role: MemberRole): Promise<Member> {
    return this.apply<MemberRole>(this.memberScope(by), by, userId, { kind: 'change_role', role });
  }

  /**
   * FR-AGY-04, UC-04.7: deactivation ends the member's sessions at once (MemberDeactivated).
   * Reactivation needs an active agency, since a suspended agency's members cannot log in (BR-13).
   */
  async setMemberStatus(
    by: Inviter,
    userId: string,
    status: 'active' | 'deactivated',
  ): Promise<Member> {
    const scope = this.memberScope(by);
    if (status === 'active' && !(await this.agencies.isActive(scope.agencyId as string))) {
      throw new AppError('AGENCY_SUSPENDED', HttpStatus.CONFLICT);
    }
    return this.apply<MemberRole>(scope, by, userId, {
      kind: status === 'active' ? 'reactivate' : 'deactivate',
    });
  }

  // ---------------------------------------------------------------- shared

  private async list<R extends UserRole>(
    scope: DirectoryScope,
    query: { page: number; pageSize: number; q?: string; role?: R; status?: AccountRow['status'] },
  ) {
    const { items, total } = await this.directory.list(scope, query);
    const invitations = await this.directory.openInvitationsOf(items.map((row) => row.id));
    const now = new Date();
    return {
      items: items.map((row) => account<R>(row, invitations.get(row.id), now)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  private async get<R extends UserRole>(scope: DirectoryScope, userId: string) {
    const row = await this.directory.find(scope, userId);
    if (!row) throw notFound();
    const invitations = await this.directory.openInvitationsOf([row.id]);
    return account<R>(row, invitations.get(row.id), new Date());
  }

  private async invitationsOf(
    agencyId: string,
    roles: readonly UserRole[],
    { page, pageSize }: PageQuery,
  ): Promise<InvitationListResponse> {
    const { items, total } = await this.directory.openAgencyInvitations(
      agencyId,
      roles,
      page,
      pageSize,
    );
    const now = new Date();
    return { items: items.map((row) => summary(row, now)), total, page, pageSize };
  }

  private async apply<R extends UserRole>(
    scope: DirectoryScope,
    by: Inviter,
    userId: string,
    change: AccountChange,
  ) {
    if (change.kind === 'change_role' && !scope.roles.includes(change.role)) {
      throw forbidden();
    }
    const result = await this.directory.change(scope, by.id, userId, change, new Date());
    if (result.outcome === 'not_found') throw notFound();
    if (result.outcome === 'refused') throw new AppError(result.code, HttpStatus.CONFLICT);
    if (change.kind === 'deactivate') {
      await this.events.publish(new MemberDeactivated(userId, scope.agencyId));
    }
    return this.get<R>(scope, userId);
  }

  private staffScope(by: Inviter): DirectoryScope {
    if (by.role !== 'platform_admin') throw forbidden();
    return STAFF_SCOPE;
  }

  /** The caller's own agency, from the session: an id in a request never chooses it. */
  private memberScope(by: Inviter): DirectoryScope {
    if (by.role !== 'agency_admin' || by.agencyId === null) throw forbidden();
    return memberScope(by.agencyId);
  }
}
