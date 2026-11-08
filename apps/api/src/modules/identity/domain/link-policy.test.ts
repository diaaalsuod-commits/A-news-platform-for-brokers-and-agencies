import { describe, expect, it } from 'vitest';
import {
  invitationExpiresAt,
  type Inviter,
  linkState,
  mayInvite,
  RESET_LINK_MINUTES,
  resetLinkExpiresAt,
} from './link-policy.js';

const now = new Date('2026-11-08T10:00:00Z');
const AGENCY = 'agency-a';
const OTHER = 'agency-b';
const inviter = (role: Inviter['role'], agencyId: string | null = null): Inviter => ({
  id: 'inviter',
  role,
  agencyId,
});

describe('link policy', () => {
  it('FR-ACC-01 an invitation expires after the configured number of days', () => {
    expect(invitationExpiresAt(now, 7)).toEqual(new Date('2026-11-15T10:00:00Z'));
    expect(invitationExpiresAt(now, 1)).toEqual(new Date('2026-11-09T10:00:00Z'));
  });

  it('FR-ACC-03 a reset link expires after 60 minutes', () => {
    expect(RESET_LINK_MINUTES).toBe(60);
    expect(resetLinkExpiresAt(now)).toEqual(new Date('2026-11-08T11:00:00Z'));
  });

  it('FR-ACC-01 a link is pending, expired, used or cancelled; used and cancelled say so after expiry', () => {
    const future = new Date(now.getTime() + 1_000);
    const past = new Date(now.getTime() - 1_000);
    expect(linkState({ expiresAt: future, usedAt: null }, now)).toBe('pending');
    expect(linkState({ expiresAt: now, usedAt: null }, now)).toBe('expired');
    expect(linkState({ expiresAt: past, usedAt: past }, now)).toBe('used');
    expect(linkState({ expiresAt: past, usedAt: null, cancelledAt: past }, now)).toBe('cancelled');
  });

  it('FR-AGY-02 an Agency Admin invites Brokers and Agency Admins into their own agency only', () => {
    const admin = inviter('agency_admin', AGENCY);
    expect(mayInvite(admin, 'broker', AGENCY)).toBe(true);
    expect(mayInvite(admin, 'agency_admin', AGENCY)).toBe(true);
    expect(mayInvite(admin, 'broker', OTHER)).toBe(false);
    expect(mayInvite(admin, 'data_operator', null)).toBe(false);
    expect(mayInvite(admin, 'platform_admin', null)).toBe(false);
  });

  it('FR-ADM-01 FR-ADM-03 a Platform Admin invites staff and the first Agency Admin, not Brokers', () => {
    const admin = inviter('platform_admin');
    expect(mayInvite(admin, 'data_operator', null)).toBe(true);
    expect(mayInvite(admin, 'platform_admin', null)).toBe(true);
    expect(mayInvite(admin, 'agency_admin', AGENCY)).toBe(true);
    expect(mayInvite(admin, 'broker', AGENCY)).toBe(false);
  });

  it('a role and its agency must agree, and Brokers and Data Operators invite nobody', () => {
    expect(mayInvite(inviter('platform_admin'), 'agency_admin', null)).toBe(false);
    expect(mayInvite(inviter('platform_admin'), 'data_operator', AGENCY)).toBe(false);
    expect(mayInvite(inviter('broker', AGENCY), 'broker', AGENCY)).toBe(false);
    expect(mayInvite(inviter('data_operator'), 'data_operator', null)).toBe(false);
  });
});
