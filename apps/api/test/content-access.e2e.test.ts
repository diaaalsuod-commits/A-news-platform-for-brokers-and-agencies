import { randomUUID } from 'node:crypto';
import type { UserRole } from '@reih/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { useIdentityApp } from './support/identity-app.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

const ID = randomUUID();

/** Every Data Operator endpoint of P4.1 (FR-DAT-01 to FR-DAT-03). */
const ENDPOINTS: [Method, string][] = [
  ['get', '/content/developers'],
  ['post', '/content/developers'],
  ['get', `/content/developers/${ID}`],
  ['patch', `/content/developers/${ID}`],
  ['delete', `/content/developers/${ID}`],
  ['put', `/content/developers/${ID}/logo`],
  ['delete', `/content/developers/${ID}/logo`],
  ['get', `/content/developers/${ID}/logo`],
  ['get', '/content/sales-contacts'],
  ['post', '/content/sales-contacts'],
  ['get', `/content/sales-contacts/${ID}`],
  ['patch', `/content/sales-contacts/${ID}`],
  ['get', '/content/areas'],
  ['post', '/content/areas'],
  ['get', `/content/areas/${ID}`],
  ['patch', `/content/areas/${ID}`],
  ['delete', `/content/areas/${ID}`],
];

const OTHER_ROLES: UserRole[] = ['platform_admin', 'agency_admin', 'broker'];

// Content is global: it belongs to no agency and no owner, so there is nothing to scope and no
// other-agency test here (docs/decisions.md, P4.1), as for the Platform Admin endpoints.
describe('Data Operator content endpoints: access (FR-ACC-04, NFR-09)', () => {
  const h = useIdentityApp();
  const sessions = {} as Record<UserRole, string>;

  beforeAll(async () => {
    for (const role of [...OTHER_ROLES, 'data_operator'] as UserRole[]) {
      const user = await h.createUser({ role });
      sessions[role] = await h.sessionFor(user.email);
    }
  });

  const call = (method: Method, path: string, session?: string) =>
    method === 'get' ? h.get(path, session) : h.send(method, path, { session, body: {} });

  it('covers all 17 endpoints', () => {
    expect(ENDPOINTS).toHaveLength(17);
  });

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
    'FR-ACC-04 a Data Operator passes the role check on %s %s',
    async (method, path) => {
      const response = await call(method, path, sessions.data_operator);
      expect([401, 403]).not.toContain(response.status);
    },
  );

  it('FR-DAT-02 there is no endpoint that deletes a sales contact', async () => {
    const response = await call('delete', `/content/sales-contacts/${ID}`, sessions.data_operator);
    expect(response.status).toBe(404);
  });
});
