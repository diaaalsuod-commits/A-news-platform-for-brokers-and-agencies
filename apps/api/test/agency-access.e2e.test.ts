import { randomUUID } from 'node:crypto';
import type { UserRole } from '@reih/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { useIdentityApp } from './support/identity-app.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

const ID = randomUUID();

/** Agency Admin only: editing branding, members and invitations (FR-AGY-01 to FR-AGY-04). */
const ADMIN_ENDPOINTS: [Method, string][] = [
  ['put', '/agency/branding'],
  ['put', '/agency/branding/logo'],
  ['delete', '/agency/branding/logo'],
  ['get', '/agency/members'],
  ['get', `/agency/members/${ID}`],
  ['patch', `/agency/members/${ID}/role`],
  ['patch', `/agency/members/${ID}/status`],
  ['get', '/agency/invitations'],
  ['post', '/agency/invitations'],
  ['post', `/agency/invitations/${ID}/resend`],
  ['post', `/agency/invitations/${ID}/cancel`],
];

/** Brokers read their own agency's branding and logo (docs/decisions.md, P3.2). */
const MEMBER_READ_ENDPOINTS: [Method, string][] = [
  ['get', '/agency/branding'],
  ['get', '/agency/branding/logo'],
];

describe('Agency endpoints: access (FR-ACC-04, NFR-09)', () => {
  const h = useIdentityApp();
  const sessions = {} as Record<UserRole, string>;

  beforeAll(async () => {
    for (const role of [
      'broker',
      'agency_admin',
      'data_operator',
      'platform_admin',
    ] as UserRole[]) {
      const user = await h.createUser({ role });
      sessions[role] = await h.sessionFor(user.email);
    }
  });

  const call = (method: Method, path: string, session?: string) =>
    method === 'get' ? h.get(path, session) : h.send(method, path, { session, body: {} });

  describe.each(['broker', 'data_operator', 'platform_admin'] as UserRole[])(
    'FR-ACC-04 %s',
    (role) => {
      it.each(ADMIN_ENDPOINTS)('is refused %s %s with 403', async (method, path) => {
        const response = await call(method, path, sessions[role]);
        expect(response.status).toBe(403);
        expect(response.body.error.code).toBe('FORBIDDEN');
      });
    },
  );

  describe.each(['data_operator', 'platform_admin'] as UserRole[])('FR-ACC-04 %s', (role) => {
    it.each(MEMBER_READ_ENDPOINTS)('belongs to no agency: %s %s is 403', async (method, path) => {
      expect((await call(method, path, sessions[role])).status).toBe(403);
    });
  });

  it('FR-AGY-01 a broker reads the own agency branding', async () => {
    expect((await h.get('/agency/branding', sessions.broker)).status).toBe(200);
  });

  it.each([...ADMIN_ENDPOINTS, ...MEMBER_READ_ENDPOINTS])(
    'FR-ACC-04 without a session %s %s answers 401',
    async (method, path) => {
      expect((await call(method, path)).status).toBe(401);
    },
  );

  it.each([...ADMIN_ENDPOINTS, ...MEMBER_READ_ENDPOINTS])(
    'FR-ACC-04 an Agency Admin passes the role check on %s %s',
    async (method, path) => {
      const response = await call(method, path, sessions.agency_admin);
      expect([401, 403]).not.toContain(response.status);
    },
  );
});

describe('Agency endpoints: another agency (NFR-09)', () => {
  const h = useIdentityApp({ mailpit: true });
  let adminA: { id: string; email: string };
  let adminB: { id: string; email: string };
  let memberA: { id: string; email: string };
  let invitationA: string;
  let sessionA: string;
  let sessionB: string;

  beforeAll(async () => {
    adminA = await h.createUser({ role: 'agency_admin', agencyId: h.agencies.active });
    adminB = await h.createUser({ role: 'agency_admin', agencyId: h.agencies.other });
    memberA = await h.createUser({ role: 'broker', agencyId: h.agencies.active });
    sessionA = await h.sessionFor(adminA.email);
    sessionB = await h.sessionFor(adminB.email);
    const invited = await h.post('/agency/invitations', {
      session: sessionA,
      body: { email: `invitee-${randomUUID().slice(0, 6)}@agency.test`, role: 'broker' },
    });
    expect(invited.status).toBe(201);
    invitationA = invited.body.invitationId;
    await h.send('put', '/agency/branding', {
      session: sessionA,
      body: { marketingName: 'Agency A Brand', primaryColor: '#111111', secondaryColor: '#222222' },
    });
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(64),
    ]);
    await h.send('put', '/agency/branding/logo', {
      session: sessionA,
      attach: { field: 'logo', content: png, filename: 'a.png' },
    });
  });

  it("FR-AGY-03 another agency's member is not in the list and is 404", async () => {
    const list = await h.get('/agency/members?pageSize=100', sessionB);
    const ids = list.body.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(memberA.id);
    expect(ids).not.toContain(adminA.id);
    expect(ids).toContain(adminB.id);
    expect((await h.get(`/agency/members/${memberA.id}`, sessionB)).status).toBe(404);
  });

  it("FR-AGY-04 another agency's member cannot be changed: 404, and nothing changes", async () => {
    const role = await h.send('patch', `/agency/members/${memberA.id}/role`, {
      session: sessionB,
      body: { role: 'agency_admin' },
    });
    const status = await h.send('patch', `/agency/members/${memberA.id}/status`, {
      session: sessionB,
      body: { status: 'deactivated' },
    });
    expect([role.status, status.status]).toEqual([404, 404]);
    const { rows } = await h.db.query('SELECT role, status FROM users WHERE id = $1', [memberA.id]);
    expect(rows[0]).toEqual({ role: 'broker', status: 'active' });
  });

  it("FR-AGY-02 another agency's invitation is not listed and cannot be resent or cancelled", async () => {
    const list = await h.get('/agency/invitations', sessionB);
    expect(list.body.items.map((item: { id: string }) => item.id)).not.toContain(invitationA);
    expect(
      (await h.post(`/agency/invitations/${invitationA}/resend`, { session: sessionB })).status,
    ).toBe(404);
    expect(
      (await h.post(`/agency/invitations/${invitationA}/cancel`, { session: sessionB })).status,
    ).toBe(404);
    const { rows } = await h.db.query('SELECT cancelled_at FROM invitations WHERE id = $1', [
      invitationA,
    ]);
    expect(rows[0].cancelled_at).toBeNull();
  });

  it("FR-AGY-01 an Agency Admin sees and edits only their own agency's branding and logo", async () => {
    const branding = await h.get('/agency/branding', sessionB);
    expect(branding.body.marketingName).not.toBe('Agency A Brand');
    expect(branding.body.logoUrl).toBeNull();
    expect((await h.get('/agency/branding/logo', sessionB)).status).toBe(404);

    await h.send('put', '/agency/branding', {
      session: sessionB,
      body: { marketingName: 'Agency B Brand', primaryColor: '#333333', secondaryColor: '#444444' },
    });
    await h.send('delete', '/agency/branding/logo', { session: sessionB });
    const a = await h.get('/agency/branding', sessionA);
    expect(a.body.marketingName).toBe('Agency A Brand');
    expect(a.body.logoUrl).not.toBeNull();
  });

  it("FR-AGY-02 an invitation always goes into the caller's own agency, whatever the body says", async () => {
    const response = await h.post('/agency/invitations', {
      session: sessionB,
      body: {
        email: `sneaky-${randomUUID().slice(0, 6)}@agency.test`,
        role: 'broker',
        agencyId: h.agencies.active,
      },
    });
    expect(response.status).toBe(400);
  });
});
