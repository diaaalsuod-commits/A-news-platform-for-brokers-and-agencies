import type { UserRole } from '@reih/contracts';

/** The two web apps (SRS 2.1): the Broker Web App and the Operations Dashboard. */
export type AppKind = 'broker' | 'ops';

const APP_ROLES: Record<AppKind, readonly UserRole[]> = {
  broker: ['broker', 'agency_admin'],
  ops: ['data_operator', 'platform_admin'],
};

/** Whether a role works in this app; the other app is its home. */
export function servesRole(app: AppKind, role: UserRole): boolean {
  return APP_ROLES[app].includes(role);
}

export function otherApp(app: AppKind): AppKind {
  return app === 'broker' ? 'ops' : 'broker';
}

/** A link in the header; shown only to the roles that may use the screen (the server decides). */
export interface NavItem {
  href: string;
  /** A key in the "nav" messages. */
  label: string;
  roles: readonly UserRole[];
}

const NAV_ITEMS: Record<AppKind, readonly NavItem[]> = {
  broker: [
    { href: '/', label: 'home', roles: ['broker', 'agency_admin'] },
    // FR-AGY-01 to FR-AGY-04: the Agency Admin's own agency.
    { href: '/agency-settings', label: 'agencySettings', roles: ['agency_admin'] },
    { href: '/profile', label: 'profile', roles: ['broker', 'agency_admin'] },
  ],
  ops: [
    { href: '/', label: 'home', roles: ['data_operator', 'platform_admin'] },
    // FR-ADM-01 to FR-ADM-06: Platform Admin screens. Data Operators get theirs with FR-DAT.
    { href: '/agencies', label: 'agencies', roles: ['platform_admin'] },
    { href: '/staff', label: 'staff', roles: ['platform_admin'] },
    { href: '/reference-data', label: 'referenceData', roles: ['platform_admin'] },
    { href: '/currencies-settings', label: 'currenciesSettings', roles: ['platform_admin'] },
    { href: '/profile', label: 'profile', roles: ['data_operator', 'platform_admin'] },
  ],
};

/** The header links a role sees in an app. */
export function navItemsFor(app: AppKind, role: UserRole): NavItem[] {
  return NAV_ITEMS[app].filter((item) => item.roles.includes(role));
}

/** The public addresses of both apps, from APP_URL and OPS_URL. */
export interface AppLinks {
  broker: string;
  ops: string;
}
