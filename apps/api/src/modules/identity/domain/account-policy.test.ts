import { describe, expect, it } from 'vitest';
import {
  type AccountTarget,
  accountChangeRefusal,
  isMemberRole,
  isStaffRole,
} from './account-policy.js';

const account = (id: string, overrides: Partial<AccountTarget> = {}): AccountTarget => ({
  id,
  role: 'platform_admin',
  status: 'active',
  hasPassword: true,
  ...overrides,
});

describe('account policy: staff (keeper: Platform Admin)', () => {
  const refusal = (
    actorId: string,
    target: AccountTarget,
    change: Parameters<typeof accountChangeRefusal>[2],
    keepers: string[],
  ) => accountChangeRefusal(actorId, target, change, keepers, 'platform_admin');

  it('FR-ADM-03 only data operators and platform admins are staff', () => {
    expect(isStaffRole('data_operator')).toBe(true);
    expect(isStaffRole('platform_admin')).toBe(true);
    expect(isStaffRole('broker')).toBe(false);
    expect(isStaffRole('agency_admin')).toBe(false);
  });

  it('FR-ADM-03 deactivating the last active Platform Admin is refused', () => {
    expect(refusal('a', account('b'), { kind: 'deactivate' }, ['b'])).toBe('LAST_PLATFORM_ADMIN');
    expect(refusal('a', account('b'), { kind: 'deactivate' }, ['a', 'b'])).toBeNull();
  });

  it('FR-ADM-03 demoting the last active Platform Admin is refused', () => {
    const change = { kind: 'change_role', role: 'data_operator' } as const;
    expect(refusal('a', account('b'), change, ['b'])).toBe('LAST_PLATFORM_ADMIN');
    expect(refusal('a', account('b'), change, ['a', 'b'])).toBeNull();
  });

  it('FR-ADM-03 an admin cannot deactivate themselves or change their own role', () => {
    expect(refusal('a', account('a'), { kind: 'deactivate' }, ['a', 'b'])).toBe(
      'CANNOT_DEACTIVATE_SELF',
    );
    expect(
      refusal('a', account('a'), { kind: 'change_role', role: 'data_operator' }, ['a', 'b']),
    ).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('FR-ADM-03 a data operator can be deactivated even when one admin is left', () => {
    const operator = account('o', { role: 'data_operator' });
    expect(refusal('a', operator, { kind: 'deactivate' }, ['a'])).toBeNull();
  });

  it('FR-ADM-03 an invited user is neither deactivated nor given a new role', () => {
    const invited = account('i', { status: 'invited', hasPassword: false });
    expect(refusal('a', invited, { kind: 'deactivate' }, ['a'])).toBe('USER_NOT_ACTIVATED');
    expect(refusal('a', invited, { kind: 'change_role', role: 'data_operator' }, ['a'])).toBe(
      'USER_NOT_ACTIVATED',
    );
  });

  it('FR-ADM-03 reactivation needs a deactivated user who once had a password', () => {
    const off = account('d', { status: 'deactivated' });
    expect(refusal('a', off, { kind: 'reactivate' }, ['a'])).toBeNull();
    expect(refusal('a', account('d'), { kind: 'reactivate' }, ['a'])).toBe('USER_ALREADY_ACTIVE');
    expect(refusal('a', { ...off, hasPassword: false }, { kind: 'reactivate' }, ['a'])).toBe(
      'USER_NOT_ACTIVATED',
    );
  });

  it('FR-ADM-03 deactivating twice and a role change to the same role are told apart', () => {
    const off = account('d', { status: 'deactivated' });
    expect(refusal('a', off, { kind: 'deactivate' }, ['a'])).toBe('USER_ALREADY_DEACTIVATED');
    expect(
      refusal('a', account('b'), { kind: 'change_role', role: 'platform_admin' }, ['a', 'b']),
    ).toBe('unchanged');
  });
});

describe('account policy: agency members (keeper: Agency Admin)', () => {
  const admin = (id: string, overrides: Partial<AccountTarget> = {}) =>
    account(id, { role: 'agency_admin', ...overrides });
  const refusal = (
    actorId: string,
    target: AccountTarget,
    change: Parameters<typeof accountChangeRefusal>[2],
    keepers: string[],
  ) => accountChangeRefusal(actorId, target, change, keepers, 'agency_admin');

  it('FR-AGY-04 only brokers and agency admins are members', () => {
    expect(isMemberRole('broker')).toBe(true);
    expect(isMemberRole('agency_admin')).toBe(true);
    expect(isMemberRole('data_operator')).toBe(false);
    expect(isMemberRole('platform_admin')).toBe(false);
  });

  it('FR-AGY-04 the agency always keeps one active Agency Admin', () => {
    expect(refusal('x', admin('b'), { kind: 'deactivate' }, ['b'])).toBe('LAST_AGENCY_ADMIN');
    expect(refusal('x', admin('b'), { kind: 'change_role', role: 'broker' }, ['b'])).toBe(
      'LAST_AGENCY_ADMIN',
    );
    expect(refusal('a', admin('b'), { kind: 'deactivate' }, ['a', 'b'])).toBeNull();
  });

  it('FR-AGY-04 an admin cannot deactivate themselves or change their own role', () => {
    expect(refusal('a', admin('a'), { kind: 'deactivate' }, ['a', 'b'])).toBe(
      'CANNOT_DEACTIVATE_SELF',
    );
    expect(refusal('a', admin('a'), { kind: 'change_role', role: 'broker' }, ['a', 'b'])).toBe(
      'CANNOT_CHANGE_OWN_ROLE',
    );
  });

  it('FR-AGY-04 a broker can be deactivated and promoted while one admin is left', () => {
    const broker = account('k', { role: 'broker' });
    expect(refusal('a', broker, { kind: 'deactivate' }, ['a'])).toBeNull();
    expect(refusal('a', broker, { kind: 'change_role', role: 'agency_admin' }, ['a'])).toBeNull();
  });
});
