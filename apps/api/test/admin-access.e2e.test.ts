import { randomUUID } from 'node:crypto';
import type { UserRole } from '@reih/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { useIdentityApp } from './support/identity-app.js';

type Method = 'get' | 'post' | 'patch' | 'delete';

const ID = randomUUID();

/** Every Platform Admin endpoint of P3.1 (FR-ADM-01 to FR-ADM-06). */
const ENDPOINTS: [Method, string][] = [
  ['get', '/admin/agencies'],
  ['post', '/admin/agencies'],
  ['get', `/admin/agencies/${ID}`],
  ['patch', `/admin/agencies/${ID}`],
  ['post', `/admin/agencies/${ID}/suspend`],
  ['post', `/admin/agencies/${ID}/reactivate`],
  ['get', `/admin/agencies/${ID}/invitations`],
  ['post', `/admin/agencies/${ID}/invitations`],
  ['post', `/admin/invitations/${ID}/resend`],
  ['post', `/admin/invitations/${ID}/cancel`],
  ['get', '/admin/staff'],
  ['post', '/admin/staff/invitations'],
  ['get', `/admin/staff/${ID}`],
  ['patch', `/admin/staff/${ID}/role`],
  ['post', `/admin/staff/${ID}/deactivate`],
  ['post', `/admin/staff/${ID}/reactivate`],
  ['get', '/admin/reference/amenities'],
  ['post', '/admin/reference/amenities'],
  ['get', `/admin/reference/amenities/${ID}`],
  ['patch', `/admin/reference/amenities/${ID}`],
  ['delete', `/admin/reference/amenities/${ID}`],
  ['get', '/admin/currencies'],
  ['patch', '/admin/currencies/USD'],
  ['get', '/admin/currencies/USD/rates'],
  ['post', '/admin/currencies/USD/rates'],
  ['get', '/admin/settings'],
  ['patch', '/admin/settings'],
];

const OTHER_ROLES: UserRole[] = ['broker', 'agency_admin', 'data_operator'];

describe('Platform Admin endpoints: access (FR-ACC-04, NFR-09)', () => {
  const h = useIdentityApp();
  const sessions = {} as Record<UserRole, string>;

  beforeAll(async () => {
    for (const role of [...OTHER_ROLES, 'platform_admin'] as UserRole[]) {
      const user = await h.createUser({ role });
      sessions[role] = await h.sessionFor(user.email);
    }
  });

  const call = (method: Method, path: string, session?: string) =>
    method === 'get' ? h.get(path, session) : h.send(method, path, { session, body: {} });

  describe.each(OTHER_ROLES)('FR-ACC-04 %s', (role) => {
    it.each(ENDPOINTS)('is refused %s %s with 403', async (method, path) => {
      const response = await call(method, path, sessions[role]);
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('FORBIDDEN');
    });
  });

  it.each(ENDPOINTS)('FR-ACC-04 without a session %s %s answers 401', async (method, path) => {
    const response = await call(method, path);
    expect(response.status).toBe(401);
  });

  it.each(ENDPOINTS)(
    'FR-ACC-04 a Platform Admin passes the role check on %s %s',
    async (method, path) => {
      const response = await call(method, path, sessions.platform_admin);
      expect([401, 403]).not.toContain(response.status);
    },
  );
});
