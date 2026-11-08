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

/** The public addresses of both apps, from APP_URL and OPS_URL. */
export interface AppLinks {
  broker: string;
  ops: string;
}
