import { describe, expect, it } from 'vitest';
import { isStaffRole, type StaffTarget, staffChangeRefusal } from './staff-policy.js';

const admin = (id: string, overrides: Partial<StaffTarget> = {}): StaffTarget => ({
  id,
  role: 'platform_admin',
  status: 'active',
  hasPassword: true,
  ...overrides,
});

describe('staff policy', () => {
  it('FR-ADM-03 only data operators and platform admins are staff', () => {
    expect(isStaffRole('data_operator')).toBe(true);
    expect(isStaffRole('platform_admin')).toBe(true);
    expect(isStaffRole('broker')).toBe(false);
    expect(isStaffRole('agency_admin')).toBe(false);
  });

  it('FR-ADM-03 deactivating the last active Platform Admin is refused', () => {
    expect(staffChangeRefusal('a', admin('b'), { kind: 'deactivate' }, ['b'])).toBe(
      'LAST_PLATFORM_ADMIN',
    );
    expect(staffChangeRefusal('a', admin('b'), { kind: 'deactivate' }, ['a', 'b'])).toBeNull();
  });

  it('FR-ADM-03 demoting the last active Platform Admin is refused', () => {
    const change = { kind: 'change_role', role: 'data_operator' } as const;
    expect(staffChangeRefusal('a', admin('b'), change, ['b'])).toBe('LAST_PLATFORM_ADMIN');
    expect(staffChangeRefusal('a', admin('b'), change, ['a', 'b'])).toBeNull();
  });

  it('FR-ADM-03 an admin cannot deactivate themselves or change their own role', () => {
    expect(staffChangeRefusal('a', admin('a'), { kind: 'deactivate' }, ['a', 'b'])).toBe(
      'CANNOT_DEACTIVATE_SELF',
    );
    expect(
      staffChangeRefusal('a', admin('a'), { kind: 'change_role', role: 'data_operator' }, [
        'a',
        'b',
      ]),
    ).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('FR-ADM-03 a data operator can be deactivated even when one admin is left', () => {
    const operator = admin('o', { role: 'data_operator' });
    expect(staffChangeRefusal('a', operator, { kind: 'deactivate' }, ['a'])).toBeNull();
  });

  it('FR-ADM-03 an invited user is neither deactivated nor given a new role', () => {
    const invited = admin('i', { status: 'invited', hasPassword: false });
    expect(staffChangeRefusal('a', invited, { kind: 'deactivate' }, ['a'])).toBe(
      'USER_NOT_ACTIVATED',
    );
    expect(
      staffChangeRefusal('a', invited, { kind: 'change_role', role: 'data_operator' }, ['a']),
    ).toBe('USER_NOT_ACTIVATED');
  });

  it('FR-ADM-03 reactivation needs a deactivated user who once had a password', () => {
    const off = admin('d', { status: 'deactivated' });
    expect(staffChangeRefusal('a', off, { kind: 'reactivate' }, ['a'])).toBeNull();
    expect(staffChangeRefusal('a', admin('d'), { kind: 'reactivate' }, ['a'])).toBe(
      'USER_ALREADY_ACTIVE',
    );
    expect(
      staffChangeRefusal('a', { ...off, hasPassword: false }, { kind: 'reactivate' }, ['a']),
    ).toBe('USER_NOT_ACTIVATED');
  });

  it('FR-ADM-03 deactivating twice and a role change to the same role are told apart', () => {
    const off = admin('d', { status: 'deactivated' });
    expect(staffChangeRefusal('a', off, { kind: 'deactivate' }, ['a'])).toBe(
      'USER_ALREADY_DEACTIVATED',
    );
    expect(
      staffChangeRefusal('a', admin('b'), { kind: 'change_role', role: 'platform_admin' }, [
        'a',
        'b',
      ]),
    ).toBe('unchanged');
  });
});
