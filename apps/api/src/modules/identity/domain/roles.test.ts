import { describe, expect, it } from 'vitest';
import { hasRequiredRole, isAgencyRole } from './roles.js';

describe('roles', () => {
  it('FR-ACC-04 agency_admin passes every broker check', () => {
    expect(hasRequiredRole('agency_admin', ['broker'])).toBe(true);
  });

  it('FR-ACC-04 broker does not pass an agency_admin check', () => {
    expect(hasRequiredRole('broker', ['agency_admin'])).toBe(false);
  });

  it('FR-ACC-04 staff roles pass only their own checks', () => {
    expect(hasRequiredRole('data_operator', ['data_operator'])).toBe(true);
    expect(hasRequiredRole('data_operator', ['platform_admin'])).toBe(false);
    expect(hasRequiredRole('platform_admin', ['broker'])).toBe(false);
    expect(hasRequiredRole('agency_admin', ['platform_admin'])).toBe(false);
  });

  it('only brokers and agency admins belong to an agency', () => {
    expect(isAgencyRole('broker')).toBe(true);
    expect(isAgencyRole('agency_admin')).toBe(true);
    expect(isAgencyRole('data_operator')).toBe(false);
    expect(isAgencyRole('platform_admin')).toBe(false);
  });
});
