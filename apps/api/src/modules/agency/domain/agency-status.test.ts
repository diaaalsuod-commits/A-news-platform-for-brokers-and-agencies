import { describe, expect, it } from 'vitest';
import { AGENCY_TRANSITIONS, statusReason } from './agency-status.js';

describe('agency status', () => {
  it('FR-ADM-02 a suspension without a reason is refused', () => {
    expect(statusReason('')).toBeNull();
    expect(statusReason('   ')).toBeNull();
    expect(statusReason(undefined)).toBeNull();
    expect(statusReason(null)).toBeNull();
  });

  it('FR-ADM-02 the reason is kept trimmed', () => {
    expect(statusReason('  Unpaid invoices  ')).toBe('Unpaid invoices');
  });

  it('FR-ADM-02 suspend moves active to suspended and reactivate moves it back', () => {
    expect(AGENCY_TRANSITIONS.suspend).toMatchObject({ from: 'active', to: 'suspended' });
    expect(AGENCY_TRANSITIONS.reactivate).toMatchObject({ from: 'suspended', to: 'active' });
  });
});
