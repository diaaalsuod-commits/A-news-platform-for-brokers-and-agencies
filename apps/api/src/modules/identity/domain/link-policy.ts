import type { UserRole } from '@reih/contracts';
import { isAgencyRole } from './roles.js';

/** FR-ACC-03: a password reset link is valid for 60 minutes. */
export const RESET_LINK_MINUTES = 60;

const DAY_MS = 24 * 60 * 60_000;

/** FR-ACC-01: an invitation is valid for settings.invitation_validity_days (FR-ADM-06). */
export function invitationExpiresAt(now: Date, validityDays: number): Date {
  return new Date(now.getTime() + validityDays * DAY_MS);
}

export function resetLinkExpiresAt(now: Date): Date {
  return new Date(now.getTime() + RESET_LINK_MINUTES * 60_000);
}

export type LinkState = 'pending' | 'cancelled' | 'used' | 'expired';

/**
 * The state of a single-use link. A cancelled or used link says so even after its expiry, which is
 * the clearer message for the person holding it.
 */
export function linkState(
  link: { expiresAt: Date; usedAt: Date | null; cancelledAt?: Date | null },
  now: Date,
): LinkState {
  if (link.cancelledAt) return 'cancelled';
  if (link.usedAt) return 'used';
  if (link.expiresAt.getTime() <= now.getTime()) return 'expired';
  return 'pending';
}

export interface Inviter {
  id: string;
  role: UserRole;
  agencyId: string | null;
}

/**
 * Who may invite whom (FR-AGY-02, FR-ADM-01, FR-ADM-03). An Agency Admin invites Brokers and Agency
 * Admins into their own agency. A Platform Admin invites staff, who belong to no agency, and the
 * first Agency Admin of an agency. Nobody else invites.
 */
export function mayInvite(by: Inviter, role: UserRole, agencyId: string | null): boolean {
  if (isAgencyRole(role) !== (agencyId !== null)) {
    return false;
  }
  if (by.role === 'agency_admin') {
    return isAgencyRole(role) && by.agencyId !== null && agencyId === by.agencyId;
  }
  if (by.role === 'platform_admin') {
    return !isAgencyRole(role) || role === 'agency_admin';
  }
  return false;
}

/** Resending or cancelling follows the same lines as inviting. */
export function mayManageInvitation(
  by: Inviter,
  invitation: { role: UserRole; agencyId: string | null },
): boolean {
  return mayInvite(by, invitation.role, invitation.agencyId);
}
