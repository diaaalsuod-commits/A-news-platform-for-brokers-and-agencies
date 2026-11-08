import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  InvitationListResponse,
  InvitationSummary,
  PageQuery,
  StaffListQuery,
  StaffListResponse,
  StaffMember,
  StaffRole,
} from '@reih/contracts';
import { EventBus, MemberDeactivated } from '../../../shared/events/index.js';
import { AppError } from '../../../shared/http/index.js';
import type { Inviter } from '../domain/link-policy.js';
import type { StaffChange } from '../domain/staff-policy.js';
import {
  type OpenInvitationRow,
  StaffRepository,
  type StaffRow,
} from '../infrastructure/staff.repository.js';

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

function member(row: StaffRow, invitation: OpenInvitationRow | undefined, now: Date): StaffMember {
  return {
    id: row.id,
    email: row.email,
    fullName: row.fullName,
    role: row.role,
    status: row.status,
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    pendingInvitation: invitation ? summary(invitation, now) : null,
  };
}

/**
 * Identity's public directory of users. FR-ADM-03: the Platform Admin's staff operations. P3.2 adds
 * the Agency Admin's member operations here. Like InvitationService, it checks the caller itself.
 */
@Injectable()
export class UserDirectory {
  constructor(
    private readonly staff: StaffRepository,
    private readonly events: EventBus,
  ) {}

  async listStaff(by: Inviter, query: StaffListQuery): Promise<StaffListResponse> {
    this.assertPlatformAdmin(by);
    const { items, total } = await this.staff.list(query);
    const invitations = await this.staff.openInvitationsOf(items.map((row) => row.id));
    const now = new Date();
    return {
      items: items.map((row) => member(row, invitations.get(row.id), now)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getStaff(by: Inviter, userId: string): Promise<StaffMember> {
    this.assertPlatformAdmin(by);
    const row = await this.staff.findStaff(userId);
    if (!row) {
      throw new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const invitations = await this.staff.openInvitationsOf([row.id]);
    return member(row, invitations.get(row.id), new Date());
  }

  /** FR-ADM-01: the agency's open Agency Admin invitations, so they can be resent or cancelled. */
  async listAgencyAdminInvitations(
    by: Inviter,
    agencyId: string,
    { page, pageSize }: PageQuery,
  ): Promise<InvitationListResponse> {
    this.assertPlatformAdmin(by);
    const { items, total } = await this.staff.openAgencyAdminInvitations(agencyId, page, pageSize);
    const now = new Date();
    return { items: items.map((row) => summary(row, now)), total, page, pageSize };
  }

  /** The role is read on every request, so the change applies at once. */
  changeRole(by: Inviter, userId: string, role: StaffRole): Promise<StaffMember> {
    return this.apply(by, userId, { kind: 'change_role', role });
  }

  /** Publishes MemberDeactivated; its listener ends the user's sessions. */
  async deactivate(by: Inviter, userId: string): Promise<StaffMember> {
    const result = await this.apply(by, userId, { kind: 'deactivate' });
    await this.events.publish(new MemberDeactivated(userId, null));
    return result;
  }

  reactivate(by: Inviter, userId: string): Promise<StaffMember> {
    return this.apply(by, userId, { kind: 'reactivate' });
  }

  private async apply(by: Inviter, userId: string, change: StaffChange): Promise<StaffMember> {
    this.assertPlatformAdmin(by);
    const result = await this.staff.change(by.id, userId, change, new Date());
    if (result.outcome === 'not_found') {
      throw new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    if (result.outcome === 'refused') {
      throw new AppError(result.code, HttpStatus.CONFLICT);
    }
    return this.getStaff(by, userId);
  }

  private assertPlatformAdmin(by: Inviter): void {
    if (by.role !== 'platform_admin') {
      throw new AppError('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
  }
}
