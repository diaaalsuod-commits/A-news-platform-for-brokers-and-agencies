import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserDirectory } from '../src/modules/identity/index.js';
import { useIdentityApp } from './support/identity-app.js';

describe('Agency members and invitations (FR-AGY-02 to FR-AGY-04)', () => {
  const h = useIdentityApp({ mailpit: true });
  let agencyId: string;
  let admin: { id: string; email: string };
  let session: string;

  beforeAll(async () => {
    agencyId = await h.createAgency('active');
    admin = await h.createUser({ role: 'agency_admin', agencyId });
  });

  beforeEach(async () => {
    session = await h.sessionFor(admin.email);
  });

  const asAgencyAdmin = (id: string, agency = agencyId) => ({
    id,
    role: 'agency_admin' as const,
    agencyId: agency,
  });
  const userRow = async (id: string) =>
    (await h.db.query('SELECT role, status, agency_id FROM users WHERE id = $1', [id])).rows[0];

  describe('FR-AGY-03 members', () => {
    it("FR-AGY-03 the list contains only members of the admin's own agency", async () => {
      const broker = await h.createUser({ role: 'broker', agencyId });
      const outsider = await h.createUser({ role: 'broker', agencyId: h.agencies.other });
      const response = await h.get('/agency/members?pageSize=100', session);
      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toEqual(expect.arrayContaining([admin.id, broker.id]));
      expect(ids).not.toContain(outsider.id);
      expect(response.body.total).toBe(ids.length);
      expect(response.body.items.find((item: { id: string }) => item.id === broker.id)).toEqual({
        id: broker.id,
        email: broker.email,
        fullName: expect.any(String),
        role: 'broker',
        status: 'active',
        lastLoginAt: null,
        createdAt: expect.any(String),
        pendingInvitation: null,
      });
    });

    it('FR-AGY-03 shows the last login, and filters by role and status', async () => {
      const broker = await h.createUser({ role: 'broker', agencyId });
      await h.sessionFor(broker.email);
      const member = await h.get(`/agency/members/${broker.id}`, session);
      expect(member.body.lastLoginAt).toEqual(expect.any(String));

      const admins = await h.get('/agency/members?role=agency_admin&pageSize=100', session);
      expect(
        admins.body.items.every((item: { role: string }) => item.role === 'agency_admin'),
      ).toBe(true);
      expect((await h.get('/agency/members?pageSize=101', session)).status).toBe(400);
    });
  });

  describe('FR-AGY-02 invitations', () => {
    it('FR-AGY-02 invites a Broker into the own agency and emails a link to the broker app', async () => {
      const email = `broker-${randomUUID().slice(0, 6)}@agency.test`;
      const response = await h.post('/agency/invitations', {
        session,
        body: { email, role: 'broker' },
      });
      expect(response.status).toBe(201);
      expect((await h.mailTo(email)).Text).toContain('https://app.localhost/en/activate#token=');
      expect(await userRow(response.body.userId)).toEqual({
        role: 'broker',
        status: 'invited',
        agency_id: agencyId,
      });

      const pending = await h.get('/agency/invitations', session);
      expect(pending.body.items.map((item: { id: string }) => item.id)).toContain(
        response.body.invitationId,
      );
      const members = await h.get(`/agency/members?q=${encodeURIComponent(email)}`, session);
      expect(members.body.items[0]).toMatchObject({
        status: 'invited',
        pendingInvitation: { id: response.body.invitationId, state: 'pending' },
      });
    });

    it('FR-AGY-02 invites an Agency Admin; resend sends a new link, cancel ends it', async () => {
      const email = `admin-${randomUUID().slice(0, 6)}@agency.test`;
      const invited = await h.post('/agency/invitations', {
        session,
        body: { email, role: 'agency_admin', language: 'ar' },
      });
      expect(invited.status).toBe(201);
      const firstToken = h.linkToken(await h.mailTo(email));
      const id = invited.body.invitationId as string;

      expect((await h.post(`/agency/invitations/${id}/resend`, { session })).status).toBe(204);
      await expect.poll(() => h.mailCount(email), { timeout: 10_000 }).toBe(2);
      expect((await h.get(`/auth/invitations/${firstToken}`)).status).toBe(404);

      expect((await h.post(`/agency/invitations/${id}/cancel`, { session })).status).toBe(204);
      const again = await h.post(`/agency/invitations/${id}/resend`, { session });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('INVITATION_CANCELLED');
    });

    it('FR-AGY-02 inviting an email that is already active in another agency is refused', async () => {
      const elsewhere = await h.createUser({ role: 'broker', agencyId: h.agencies.other });
      const response = await h.post('/agency/invitations', {
        session,
        body: { email: elsewhere.email, role: 'broker' },
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
      expect((await userRow(elsewhere.id)).agency_id).toBe(h.agencies.other);
    });

    it('FR-AGY-02 only Broker and Agency Admin can be invited', async () => {
      for (const role of ['data_operator', 'platform_admin']) {
        const response = await h.post('/agency/invitations', {
          session,
          body: { email: `staff-${randomUUID().slice(0, 6)}@agency.test`, role },
        });
        expect(response.status).toBe(400);
      }
    });
  });

  describe('FR-AGY-04 role and status', () => {
    it('FR-AGY-04 promotes a broker and the new role applies at once', async () => {
      const broker = await h.createUser({ role: 'broker', agencyId });
      const brokerSession = await h.sessionFor(broker.email);
      expect((await h.get('/agency/members', brokerSession)).status).toBe(403);

      const response = await h.send('patch', `/agency/members/${broker.id}/role`, {
        session,
        body: { role: 'agency_admin' },
      });
      expect(response.status).toBe(200);
      expect(response.body.role).toBe('agency_admin');
      expect((await h.get('/agency/members', brokerSession)).status).toBe(200);
    });

    it('FR-AGY-04 an admin cannot change their own role or deactivate themselves', async () => {
      const role = await h.send('patch', `/agency/members/${admin.id}/role`, {
        session,
        body: { role: 'broker' },
      });
      expect(role.status).toBe(409);
      expect(role.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
      const status = await h.send('patch', `/agency/members/${admin.id}/status`, {
        session,
        body: { status: 'deactivated' },
      });
      expect(status.status).toBe(409);
      expect(status.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');
      expect(await userRow(admin.id)).toMatchObject({ role: 'agency_admin', status: 'active' });
    });

    it("FR-AGY-04 a deactivated member's sessions end immediately", async () => {
      const broker = await h.createUser({ role: 'broker', agencyId });
      const first = await h.sessionFor(broker.email);
      const second = await h.sessionFor(broker.email);

      const response = await h.send('patch', `/agency/members/${broker.id}/status`, {
        session,
        body: { status: 'deactivated' },
      });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('deactivated');
      expect((await h.sessionRow(first))?.ended_at).toBeInstanceOf(Date);
      expect((await h.sessionRow(second))?.ended_at).toBeInstanceOf(Date);
      expect((await h.get('/me', first)).status).toBe(401);
      expect((await h.login(broker.email)).status).toBe(401);

      const reactivated = await h.send('patch', `/agency/members/${broker.id}/status`, {
        session,
        body: { status: 'active' },
      });
      expect(reactivated.status).toBe(200);
      expect((await h.login(broker.email)).status).toBe(200);
      expect((await h.get('/me', first)).status).toBe(401);
    });

    it('FR-AGY-04 reactivation needs a member who once set a password', async () => {
      const invited = await h.createUser({
        role: 'broker',
        agencyId,
        status: 'invited',
        withPassword: false,
      });
      const deactivate = await h.send('patch', `/agency/members/${invited.id}/status`, {
        session,
        body: { status: 'deactivated' },
      });
      expect(deactivate.body.error.code).toBe('USER_NOT_ACTIVATED');

      const never = await h.createUser({
        role: 'broker',
        agencyId,
        status: 'deactivated',
        withPassword: false,
      });
      const reactivate = await h.send('patch', `/agency/members/${never.id}/status`, {
        session,
        body: { status: 'active' },
      });
      expect(reactivate.status).toBe(409);
      expect(reactivate.body.error.code).toBe('USER_NOT_ACTIVATED');
    });

    it('FR-AGY-04 BR-13 no reactivation while the agency is suspended', async () => {
      const directory = h.app.get(UserDirectory);
      const suspendedAdmin = await h.createUser({
        role: 'agency_admin',
        agencyId: h.agencies.suspended,
      });
      const member = await h.createUser({
        role: 'broker',
        agencyId: h.agencies.suspended,
        status: 'deactivated',
      });
      await expect(
        directory.setMemberStatus(
          asAgencyAdmin(suspendedAdmin.id, h.agencies.suspended),
          member.id,
          'active',
        ),
      ).rejects.toMatchObject({ code: 'AGENCY_SUSPENDED' });
      expect((await userRow(member.id)).status).toBe('deactivated');
    });

    it("FR-AGY-04 staff and other agencies' users are not members: 404", async () => {
      const operator = await h.createUser({ role: 'data_operator' });
      expect((await h.get(`/agency/members/${operator.id}`, session)).status).toBe(404);
      const response = await h.send('patch', `/agency/members/${operator.id}/status`, {
        session,
        body: { status: 'deactivated' },
      });
      expect(response.status).toBe(404);
      expect((await userRow(operator.id)).status).toBe('active');
    });
  });

  describe('FR-AGY-04 the agency always keeps one active Agency Admin', () => {
    /** A new agency whose only active admins are these, created fresh for each case. */
    async function agencyWithAdmins(count: number) {
      const agency = await h.createAgency('active');
      const admins = [];
      for (let index = 0; index < count; index += 1) {
        admins.push(await h.createUser({ role: 'agency_admin', agencyId: agency }));
      }
      return { agency, admins };
    }

    const activeAdmins = async (agency: string) =>
      Number(
        (
          await h.db.query(
            `SELECT count(*) AS n FROM users
              WHERE agency_id = $1 AND role = 'agency_admin' AND status = 'active'`,
            [agency],
          )
        ).rows[0].n,
      );

    it('FR-AGY-04 deactivating or demoting the last active Agency Admin is refused', async () => {
      // Over HTTP the caller is always another active admin of the agency, so the last one can only
      // be reached by a caller whose own account was just changed; UserDirectory is called directly.
      const directory = h.app.get(UserDirectory);
      const { agency, admins } = await agencyWithAdmins(1);
      const former = await h.createUser({
        role: 'agency_admin',
        agencyId: agency,
        status: 'deactivated',
      });
      const by = asAgencyAdmin(former.id, agency);
      const last = (admins[0] as { id: string }).id;

      await expect(directory.setMemberStatus(by, last, 'deactivated')).rejects.toMatchObject({
        code: 'LAST_AGENCY_ADMIN',
      });
      await expect(directory.changeMemberRole(by, last, 'broker')).rejects.toMatchObject({
        code: 'LAST_AGENCY_ADMIN',
      });
      expect(await activeAdmins(agency)).toBe(1);
    });

    it("FR-AGY-04 another agency's admins do not count toward this agency", async () => {
      const directory = h.app.get(UserDirectory);
      const { agency, admins } = await agencyWithAdmins(1);
      const former = await h.createUser({
        role: 'agency_admin',
        agencyId: agency,
        status: 'deactivated',
      });
      await agencyWithAdmins(3);
      await expect(
        directory.setMemberStatus(
          asAgencyAdmin(former.id, agency),
          (admins[0] as { id: string }).id,
          'deactivated',
        ),
      ).rejects.toMatchObject({ code: 'LAST_AGENCY_ADMIN' });
    });

    it.each([
      ['deactivating', 'deactivate'],
      ['demoting', 'demote'],
    ] as const)(
      'FR-AGY-04 two admins %s each other at the same time leave one active Agency Admin',
      async (_label, action) => {
        const directory = h.app.get(UserDirectory);
        for (let round = 0; round < 10; round += 1) {
          const { agency, admins } = await agencyWithAdmins(2);
          const [a, b] = admins;
          if (!a || !b) throw new Error('two admins expected');
          const act = (actor: { id: string }, target: { id: string }) =>
            action === 'deactivate'
              ? directory.setMemberStatus(asAgencyAdmin(actor.id, agency), target.id, 'deactivated')
              : directory.changeMemberRole(asAgencyAdmin(actor.id, agency), target.id, 'broker');
          const results = await Promise.allSettled([act(a, b), act(b, a)]);
          const rejected = results.filter(
            (result): result is PromiseRejectedResult => result.status === 'rejected',
          );
          expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
          expect(rejected).toHaveLength(1);
          expect(rejected[0]?.reason).toMatchObject({ code: 'LAST_AGENCY_ADMIN' });
          expect(await activeAdmins(agency)).toBe(1);
        }
      },
    );

    it('FR-AGY-04 the same race over HTTP also leaves one active Agency Admin', async () => {
      const { agency, admins } = await agencyWithAdmins(2);
      const [a, b] = admins as [{ id: string; email: string }, { id: string; email: string }];
      const [sessionA, sessionB] = [await h.sessionFor(a.email), await h.sessionFor(b.email)];
      const responses = await Promise.all([
        h.send('patch', `/agency/members/${b.id}/status`, {
          session: sessionA,
          body: { status: 'deactivated' },
        }),
        h.send('patch', `/agency/members/${a.id}/status`, {
          session: sessionB,
          body: { status: 'deactivated' },
        }),
      ]);
      const statuses = responses.map((response) => response.status).sort();
      // One succeeds. The other is refused as the last admin, or, if it arrived after the first
      // finished, its own session has already ended.
      expect(statuses[0]).toBe(200);
      expect([401, 409]).toContain(statuses[1]);
      expect(await activeAdmins(agency)).toBe(1);
    });
  });
});
