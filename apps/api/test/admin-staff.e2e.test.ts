import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { UserDirectory } from '../src/modules/identity/index.js';
import { useIdentityApp } from './support/identity-app.js';

describe('Platform Admin: staff (FR-ADM-03)', () => {
  const h = useIdentityApp({ mailpit: true });
  let admin: { id: string; email: string };
  let session: string;

  beforeAll(async () => {
    admin = await h.createUser({ role: 'platform_admin' });
  });

  beforeEach(async () => {
    session = await h.sessionFor(admin.email);
  });

  const userRow = async (id: string) =>
    (await h.db.query('SELECT role, status FROM users WHERE id = $1', [id])).rows[0];

  describe('FR-ADM-03 invitations', () => {
    it('FR-ADM-03 invites a Data Operator by email with a link to the Operations Dashboard', async () => {
      const email = `operator-${randomUUID().slice(0, 6)}@reih.test`;
      const response = await h.post('/admin/staff/invitations', {
        session,
        body: { email, role: 'data_operator' },
      });
      expect(response.status).toBe(201);
      const message = await h.mailTo(email);
      expect(message.Text).toContain('https://ops.localhost/en/activate#token=');
      expect(await userRow(response.body.userId)).toEqual({
        role: 'data_operator',
        status: 'invited',
      });

      const listed = await h.get(`/admin/staff?q=${encodeURIComponent(email)}`, session);
      expect(listed.status).toBe(200);
      expect(listed.body.total).toBe(1);
      expect(listed.body.items[0]).toMatchObject({
        id: response.body.userId,
        status: 'invited',
        pendingInvitation: { id: response.body.invitationId, state: 'pending' },
      });
    });

    it('FR-ADM-03 invites a Platform Admin; resend and cancel work while pending', async () => {
      const email = `admin-${randomUUID().slice(0, 6)}@reih.test`;
      const invited = await h.post('/admin/staff/invitations', {
        session,
        body: { email, role: 'platform_admin', language: 'ar' },
      });
      expect(invited.status).toBe(201);
      const id = invited.body.invitationId as string;

      expect((await h.post(`/admin/invitations/${id}/resend`, { session })).status).toBe(204);
      await expect.poll(() => h.mailCount(email), { timeout: 10_000 }).toBe(2);
      expect((await h.post(`/admin/invitations/${id}/cancel`, { session })).status).toBe(204);

      const member = await h.get(`/admin/staff/${invited.body.userId}`, session);
      expect(member.body.pendingInvitation).toBeNull();
    });

    it('FR-ADM-03 only staff roles can be invited here', async () => {
      const response = await h.post('/admin/staff/invitations', {
        session,
        body: { email: `broker-${randomUUID().slice(0, 6)}@reih.test`, role: 'broker' },
      });
      expect(response.status).toBe(400);
    });

    it('FR-ADM-03 an email that already has an account is refused', async () => {
      const existing = await h.createUser({ role: 'data_operator' });
      const response = await h.post('/admin/staff/invitations', {
        session,
        body: { email: existing.email, role: 'data_operator' },
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
    });
  });

  describe('FR-ADM-03 list and roles', () => {
    it('FR-ADM-03 lists staff only, filtered by role and status', async () => {
      const operator = await h.createUser({ role: 'data_operator' });
      await h.createUser({ role: 'broker' });
      const all = await h.get('/admin/staff?pageSize=100', session);
      const roles = new Set(all.body.items.map((item: { role: string }) => item.role));
      expect([...roles].sort()).toEqual(['data_operator', 'platform_admin']);

      const operators = await h.get(
        '/admin/staff?role=data_operator&status=active&pageSize=100',
        session,
      );
      expect(operators.body.items.map((item: { id: string }) => item.id)).toContain(operator.id);
      expect(
        operators.body.items.every(
          (item: { role: string; status: string }) =>
            item.role === 'data_operator' && item.status === 'active',
        ),
      ).toBe(true);
    });

    it('FR-ADM-03 a role change applies at once', async () => {
      const operator = await h.createUser({ role: 'data_operator' });
      const operatorSession = await h.sessionFor(operator.email);
      expect((await h.get('/admin/settings', operatorSession)).status).toBe(403);

      const promoted = await h.send('patch', `/admin/staff/${operator.id}/role`, {
        session,
        body: { role: 'platform_admin' },
      });
      expect(promoted.status).toBe(200);
      expect(promoted.body.role).toBe('platform_admin');
      expect((await h.get('/admin/settings', operatorSession)).status).toBe(200);

      const demoted = await h.send('patch', `/admin/staff/${operator.id}/role`, {
        session,
        body: { role: 'data_operator' },
      });
      expect(demoted.body.role).toBe('data_operator');
      expect((await h.get('/admin/settings', operatorSession)).status).toBe(403);
    });

    it('FR-ADM-03 an admin cannot change their own role', async () => {
      const response = await h.send('patch', `/admin/staff/${admin.id}/role`, {
        session,
        body: { role: 'data_operator' },
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
    });

    it('FR-ADM-03 agency users are not staff: not found here', async () => {
      const broker = await h.createUser({ role: 'broker' });
      expect((await h.get(`/admin/staff/${broker.id}`, session)).status).toBe(404);
      const response = await h.post(`/admin/staff/${broker.id}/deactivate`, { session });
      expect(response.status).toBe(404);
      expect((await userRow(broker.id)).status).toBe('active');
    });
  });

  describe('FR-ADM-03 deactivate and reactivate', () => {
    it('FR-ADM-03 deactivation ends the sessions and refuses login; reactivation restores login', async () => {
      const operator = await h.createUser({ role: 'data_operator' });
      const first = await h.sessionFor(operator.email);
      const second = await h.sessionFor(operator.email);

      const response = await h.post(`/admin/staff/${operator.id}/deactivate`, { session });
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('deactivated');
      // MemberDeactivated's listener ended both sessions in the database.
      expect((await h.sessionRow(first))?.ended_at).toBeInstanceOf(Date);
      expect((await h.sessionRow(second))?.ended_at).toBeInstanceOf(Date);
      expect((await h.get('/me', first)).status).toBe(401);
      expect((await h.login(operator.email)).status).toBe(401);

      const again = await h.post(`/admin/staff/${operator.id}/deactivate`, { session });
      expect(again.body.error.code).toBe('USER_ALREADY_DEACTIVATED');

      const reactivated = await h.post(`/admin/staff/${operator.id}/reactivate`, { session });
      expect(reactivated.status).toBe(200);
      expect(reactivated.body.status).toBe('active');
      expect((await h.login(operator.email)).status).toBe(200);
      expect((await h.get('/me', first)).status).toBe(401);
    });

    it('FR-ADM-03 an admin cannot deactivate themselves', async () => {
      const response = await h.post(`/admin/staff/${admin.id}/deactivate`, { session });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('CANNOT_DEACTIVATE_SELF');
      expect((await userRow(admin.id)).status).toBe('active');
    });

    it('FR-ADM-03 an invited user is not deactivated; one who never set a password is not reactivated', async () => {
      const invited = await h.createUser({
        role: 'data_operator',
        status: 'invited',
        withPassword: false,
      });
      const deactivate = await h.post(`/admin/staff/${invited.id}/deactivate`, { session });
      expect(deactivate.body.error.code).toBe('USER_NOT_ACTIVATED');

      const neverActivated = await h.createUser({
        role: 'data_operator',
        status: 'deactivated',
        withPassword: false,
      });
      const reactivate = await h.post(`/admin/staff/${neverActivated.id}/reactivate`, { session });
      expect(reactivate.status).toBe(409);
      expect(reactivate.body.error.code).toBe('USER_NOT_ACTIVATED');
    });
  });

  describe('FR-ADM-03 at least one active Platform Admin remains', () => {
    /** Leaves exactly these admins active, and gives them back afterwards. */
    async function onlyActiveAdmins(ids: string[]): Promise<() => Promise<void>> {
      const { rows } = await h.db.query<{ id: string }>(
        `UPDATE users SET status = 'deactivated'
          WHERE role = 'platform_admin' AND status = 'active' AND NOT (id = ANY($1::uuid[]))
          RETURNING id`,
        [ids],
      );
      return async () => {
        await h.db.query(`UPDATE users SET status = 'active' WHERE id = ANY($1::uuid[])`, [
          rows.map((row) => row.id),
        ]);
      };
    }

    const activeAdmins = async () =>
      Number(
        (
          await h.db.query(
            "SELECT count(*) AS n FROM users WHERE role = 'platform_admin' AND status = 'active'",
          )
        ).rows[0].n,
      );

    it('FR-ADM-03 deactivating the last active Platform Admin is refused', async () => {
      // Over HTTP the caller is always another active admin, so the last one can only be reached
      // by a caller whose own account was just deactivated; UserDirectory is called directly.
      const directory = h.app.get(UserDirectory);
      const last = await h.createUser({ role: 'platform_admin' });
      const formerAdmin = await h.createUser({ role: 'platform_admin', status: 'deactivated' });
      const restore = await onlyActiveAdmins([last.id]);
      try {
        const by = { id: formerAdmin.id, role: 'platform_admin' as const, agencyId: null };
        await expect(directory.deactivate(by, last.id)).rejects.toMatchObject({
          code: 'LAST_PLATFORM_ADMIN',
        });
        await expect(directory.changeRole(by, last.id, 'data_operator')).rejects.toMatchObject({
          code: 'LAST_PLATFORM_ADMIN',
        });
        expect(await activeAdmins()).toBe(1);
      } finally {
        await restore();
      }
    });

    it('FR-ADM-03 two admins deactivating each other at the same time leave one active admin', async () => {
      const directory = h.app.get(UserDirectory);
      for (let round = 0; round < 10; round += 1) {
        const a = await h.createUser({ role: 'platform_admin' });
        const b = await h.createUser({ role: 'platform_admin' });
        const restore = await onlyActiveAdmins([a.id, b.id]);
        try {
          const asAdmin = (id: string) => ({ id, role: 'platform_admin' as const, agencyId: null });
          const results = await Promise.allSettled([
            directory.deactivate(asAdmin(a.id), b.id),
            directory.deactivate(asAdmin(b.id), a.id),
          ]);
          const fulfilled = results.filter((result) => result.status === 'fulfilled');
          const rejected = results.filter(
            (result): result is PromiseRejectedResult => result.status === 'rejected',
          );
          expect(fulfilled).toHaveLength(1);
          expect(rejected).toHaveLength(1);
          expect(rejected[0]?.reason).toMatchObject({ code: 'LAST_PLATFORM_ADMIN' });
          expect(await activeAdmins()).toBe(1);
        } finally {
          await restore();
        }
      }
    });

    it('FR-ADM-03 the same race over HTTP also leaves one active admin', async () => {
      const a = await h.createUser({ role: 'platform_admin' });
      const b = await h.createUser({ role: 'platform_admin' });
      const sessionA = await h.sessionFor(a.email);
      const sessionB = await h.sessionFor(b.email);
      const restore = await onlyActiveAdmins([a.id, b.id]);
      try {
        const responses = await Promise.all([
          h.post(`/admin/staff/${b.id}/deactivate`, { session: sessionA }),
          h.post(`/admin/staff/${a.id}/deactivate`, { session: sessionB }),
        ]);
        const statuses = responses.map((response) => response.status).sort();
        // One succeeds. The other is refused as the last admin, or, if it arrived after the first
        // finished, its own session has already ended.
        expect(statuses[0]).toBe(200);
        expect([401, 409]).toContain(statuses[1]);
        expect(await activeAdmins()).toBe(1);
      } finally {
        await restore();
      }
    });
  });
});
