import { describe, expect, it } from 'vitest';
import { navItemsFor } from './app-config';

const labels = (app: 'broker' | 'ops', role: Parameters<typeof navItemsFor>[1]) =>
  navItemsFor(app, role).map((item) => item.label);

describe('navigation by role (FR-ACC-04)', () => {
  it('FR-ACC-04 brokers see no Agency settings; Agency Admins do', () => {
    expect(labels('broker', 'broker')).toEqual(['home', 'profile']);
    expect(labels('broker', 'agency_admin')).toEqual(['home', 'agencySettings', 'profile']);
  });

  it('FR-ACC-04 Data Operators see no admin screens; Platform Admins see all four', () => {
    expect(labels('ops', 'data_operator')).toEqual(['home', 'profile']);
    expect(labels('ops', 'platform_admin')).toEqual([
      'home',
      'agencies',
      'staff',
      'referenceData',
      'currenciesSettings',
      'profile',
    ]);
  });
});
