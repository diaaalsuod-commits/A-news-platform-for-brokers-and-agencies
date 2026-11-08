import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useIdentityApp } from './support/identity-app.js';

describe('Platform Admin: agencies (FR-ADM-01, FR-ADM-02, BR-13)', () => {
  const h = useIdentityApp({ mailpit: true });
  let admin: { id: string; email: string };
  let session: string;

  beforeAll(async () => {
    admin = await h.createUser({ role: 'platform_admin' });
  });

  // Each test logs in again: beforeEach flushes Redis, and a fresh session keeps tests apart.
  beforeEach(async () => {
    session = await h.sessionFor(admin.email);
  });

  const newAgency = (overrides: Record<string, unknown> = {}) => {
    const tag = randomUUID().slice(0, 8);
    return {
      nameAr: `وكالة ${tag}`,
      nameEn: `Agency ${tag}`,
      tradeLicenseNo: `TL-${tag}`,
      contactEmail: `Office-${tag}@Agency.test`,
      contactPhone: '+971501234567',
      ...overrides,
    };
  };

  async function createAgency(overrides: Record<string, unknown> = {}) {
    const response = await h.post('/admin/agencies', { session, body: newAgency(overrides) });
    expect(response.status).toBe(201);
    return response.body as { id: string; status: string; tradeLicenseNo: string };
  }

  describe('FR-ADM-01 create, edit and list agencies', () => {
    it('FR-ADM-01 creates an active agency with both names, license, email and phone', async () => {
      const body = newAgency();
      const response = await h.post('/admin/agencies', { session, body });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        nameAr: body.nameAr,
        nameEn: body.nameEn,
        tradeLicenseNo: body.tradeLicenseNo,
        contactEmail: body.contactEmail.toLowerCase(),
        contactPhone: '+971501234567',
        status: 'active',
        statusReason: null,
      });
      const { rows } = await h.db.query('SELECT created_by FROM agencies WHERE id = $1', [
        response.body.id,
      ]);
      expect(rows[0].created_by).toBe(admin.id);
    });

    it('FR-ADM-01 Arabic and English names are both required', async () => {
      for (const missing of ['nameAr', 'nameEn']) {
        const body: Record<string, unknown> = newAgency();
        delete body[missing];
        const response = await h.post('/admin/agencies', { session, body });
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_FAILED');
      }
      const blank = await h.post('/admin/agencies', { session, body: newAgency({ nameAr: '  ' }) });
      expect(blank.status).toBe(400);
    });

    it('FR-ADM-01 the trade license number is unique', async () => {
      const first = await createAgency();
      const second = await h.post('/admin/agencies', {
        session,
        body: newAgency({ tradeLicenseNo: first.tradeLicenseNo }),
      });
      expect(second.status).toBe(409);
      expect(second.body.error.code).toBe('TRADE_LICENSE_TAKEN');

      const other = await createAgency();
      const edit = await h.send('patch', `/admin/agencies/${other.id}`, {
        session,
        body: { tradeLicenseNo: first.tradeLicenseNo },
      });
      expect(edit.status).toBe(409);
      expect(edit.body.error.code).toBe('TRADE_LICENSE_TAKEN');
    });

    it('FR-ADM-01 edits only the fields sent', async () => {
      const agency = await createAgency();
      const response = await h.send('patch', `/admin/agencies/${agency.id}`, {
        session,
        body: { nameEn: 'Renamed Agency', contactPhone: '+971509999999' },
      });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        nameEn: 'Renamed Agency',
        contactPhone: '+971509999999',
        tradeLicenseNo: agency.tradeLicenseNo,
      });
    });

    it('FR-ADM-01 refuses an unknown field and an invalid phone', async () => {
      const agency = await createAgency();
      for (const body of [{ status: 'suspended' }, { contactPhone: '0501234567' }]) {
        const response = await h.send('patch', `/admin/agencies/${agency.id}`, { session, body });
        expect(response.status).toBe(400);
      }
    });

    it('FR-ADM-01 lists agencies with search and status filter in the list shape', async () => {
      const agency = await createAgency({ nameEn: `Searchable ${randomUUID().slice(0, 6)}` });
      const response = await h.get(
        `/admin/agencies?q=${encodeURIComponent(agency.tradeLicenseNo)}&pageSize=5`,
        session,
      );
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ total: 1, page: 1, pageSize: 5 });
      expect(response.body.items[0].id).toBe(agency.id);

      const suspended = await h.get('/admin/agencies?status=suspended&pageSize=100', session);
      expect(
        suspended.body.items.every((item: { status: string }) => item.status === 'suspended'),
      ).toBe(true);
      expect(suspended.body.items.map((item: { id: string }) => item.id)).toContain(
        h.agencies.suspended,
      );

      const tooLarge = await h.get('/admin/agencies?pageSize=101', session);
      expect(tooLarge.status).toBe(400);
    });

    it('FR-ADM-01 an unknown agency is 404 and a malformed id is 400', async () => {
      expect((await h.get(`/admin/agencies/${randomUUID()}`, session)).status).toBe(404);
      expect((await h.get('/admin/agencies/not-a-uuid', session)).status).toBe(400);
    });
  });

  describe('FR-ADM-01 first Agency Admin invitation', () => {
    it('FR-ADM-01 the first Agency Admin receives an invitation email', async () => {
      const agency = await createAgency();
      const email = `first-admin-${randomUUID().slice(0, 6)}@agency.test`;
      const response = await h.post(`/admin/agencies/${agency.id}/invitations`, {
        session,
        body: { email, language: 'ar' },
      });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        invitationId: expect.any(String),
        userId: expect.any(String),
      });

      const message = await h.mailTo(email);
      expect(message.Text).toContain('https://app.localhost/ar/activate#token=');
      const { rows } = await h.db.query('SELECT role, agency_id, status FROM users WHERE id = $1', [
        response.body.userId,
      ]);
      expect(rows[0]).toEqual({ role: 'agency_admin', agency_id: agency.id, status: 'invited' });

      const list = await h.get(`/admin/agencies/${agency.id}/invitations`, session);
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items[0]).toMatchObject({
        id: response.body.invitationId,
        email,
        role: 'agency_admin',
        state: 'pending',
      });
    });

    it('FR-ADM-01 resending sends a new link and the old one stops working', async () => {
      const agency = await createAgency();
      const email = `resend-${randomUUID().slice(0, 6)}@agency.test`;
      const invited = await h.post(`/admin/agencies/${agency.id}/invitations`, {
        session,
        body: { email },
      });
      const firstToken = h.linkToken(await h.mailTo(email));

      const resend = await h.post(`/admin/invitations/${invited.body.invitationId}/resend`, {
        session,
      });
      expect(resend.status).toBe(204);
      await expect.poll(() => h.mailCount(email), { timeout: 10_000 }).toBe(2);
      const secondToken = h.linkToken(await h.mailTo(email));
      expect(secondToken).not.toBe(firstToken);
      expect((await h.get(`/auth/invitations/${firstToken}`)).status).toBe(404);
      expect((await h.get(`/auth/invitations/${secondToken}`)).status).toBe(200);
    });

    it('FR-ADM-01 a cancelled invitation cannot be used, resent or cancelled again', async () => {
      const agency = await createAgency();
      const email = `cancel-${randomUUID().slice(0, 6)}@agency.test`;
      const invited = await h.post(`/admin/agencies/${agency.id}/invitations`, {
        session,
        body: { email },
      });
      const token = h.linkToken(await h.mailTo(email));
      const id = invited.body.invitationId as string;

      expect((await h.post(`/admin/invitations/${id}/cancel`, { session })).status).toBe(204);
      expect((await h.get(`/auth/invitations/${token}`)).body.error.code).toBe(
        'INVITATION_CANCELLED',
      );
      for (const action of ['resend', 'cancel']) {
        const again = await h.post(`/admin/invitations/${id}/${action}`, { session });
        expect(again.status).toBe(409);
        expect(again.body.error.code).toBe('INVITATION_CANCELLED');
      }
      const list = await h.get(`/admin/agencies/${agency.id}/invitations`, session);
      expect(list.body.total).toBe(0);
    });

    it('FR-ADM-01 no invitation into a suspended agency, and none to an unknown one', async () => {
      const suspended = await h.post(`/admin/agencies/${h.agencies.suspended}/invitations`, {
        session,
        body: { email: `nope-${randomUUID().slice(0, 6)}@agency.test` },
      });
      expect(suspended.status).toBe(409);
      expect(suspended.body.error.code).toBe('AGENCY_SUSPENDED');

      const unknown = await h.post(`/admin/agencies/${randomUUID()}/invitations`, {
        session,
        body: { email: `nope-${randomUUID().slice(0, 6)}@agency.test` },
      });
      expect(unknown.status).toBe(404);
    });
  });

  describe('FR-ADM-02 suspend and reactivate', () => {
    it('FR-ADM-02 a suspension without a reason is refused', async () => {
      const agency = await createAgency();
      for (const body of [{}, { reason: '' }, { reason: '    ' }]) {
        const response = await h.post(`/admin/agencies/${agency.id}/suspend`, { session, body });
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_FAILED');
      }
      const { rows } = await h.db.query('SELECT status FROM agencies WHERE id = $1', [agency.id]);
      expect(rows[0].status).toBe('active');
    });

    it('FR-ADM-02 a reactivation without a reason is refused', async () => {
      const agency = await createAgency();
      await h.post(`/admin/agencies/${agency.id}/suspend`, { session, body: { reason: 'Audit' } });
      const response = await h.post(`/admin/agencies/${agency.id}/reactivate`, {
        session,
        body: { reason: ' ' },
      });
      expect(response.status).toBe(400);
    });

    it('FR-ADM-02 stores the status, reason, admin and time of each change', async () => {
      const agency = await createAgency();
      const suspended = await h.post(`/admin/agencies/${agency.id}/suspend`, {
        session,
        body: { reason: '  Unpaid subscription  ' },
      });
      expect(suspended.status).toBe(200);
      expect(suspended.body).toMatchObject({
        status: 'suspended',
        statusReason: 'Unpaid subscription',
        statusChangedAt: expect.any(String),
      });
      const after = await h.db.query(
        'SELECT status, status_reason, status_changed_by, status_changed_at FROM agencies WHERE id = $1',
        [agency.id],
      );
      expect(after.rows[0]).toMatchObject({
        status: 'suspended',
        status_reason: 'Unpaid subscription',
        status_changed_by: admin.id,
      });

      const reactivated = await h.post(`/admin/agencies/${agency.id}/reactivate`, {
        session,
        body: { reason: 'Paid' },
      });
      expect(reactivated.status).toBe(200);
      expect(reactivated.body).toMatchObject({ status: 'active', statusReason: 'Paid' });
    });

    it('FR-ADM-02 suspending twice or reactivating an active agency is a conflict', async () => {
      const agency = await createAgency();
      const reactivate = await h.post(`/admin/agencies/${agency.id}/reactivate`, {
        session,
        body: { reason: 'Nothing to do' },
      });
      expect(reactivate.status).toBe(409);
      expect(reactivate.body.error.code).toBe('AGENCY_ALREADY_ACTIVE');

      await h.post(`/admin/agencies/${agency.id}/suspend`, { session, body: { reason: 'One' } });
      const again = await h.post(`/admin/agencies/${agency.id}/suspend`, {
        session,
        body: { reason: 'Two' },
      });
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('AGENCY_ALREADY_SUSPENDED');

      const unknown = await h.post(`/admin/agencies/${randomUUID()}/suspend`, {
        session,
        body: { reason: 'Gone' },
      });
      expect(unknown.status).toBe(404);
    });

    it('BR-13 suspension ends every member session, refuses login, and keeps the data', async () => {
      const agency = await createAgency();
      const broker = await h.createUser({ role: 'broker', agencyId: agency.id });
      const agencyAdmin = await h.createUser({ role: 'agency_admin', agencyId: agency.id });
      const outsider = await h.createUser({ role: 'broker' });
      const brokerSession = await h.sessionFor(broker.email);
      const agencyAdminSession = await h.sessionFor(agencyAdmin.email);
      const outsiderSession = await h.sessionFor(outsider.email);
      expect((await h.get('/me', brokerSession)).status).toBe(200);

      const response = await h.post(`/admin/agencies/${agency.id}/suspend`, {
        session,
        body: { reason: 'Breach of terms' },
      });
      expect(response.status).toBe(200);

      // The sessions really ended in the database, not only at the next request.
      expect((await h.sessionRow(brokerSession))?.ended_at).toBeInstanceOf(Date);
      expect((await h.sessionRow(agencyAdminSession))?.ended_at).toBeInstanceOf(Date);
      expect((await h.sessionRow(outsiderSession))?.ended_at).toBeNull();
      expect((await h.get('/me', brokerSession)).status).toBe(401);
      expect((await h.get('/me', agencyAdminSession)).status).toBe(401);
      expect((await h.get('/me', outsiderSession)).status).toBe(200);

      const login = await h.login(broker.email);
      expect(login.status).toBe(401);
      expect(login.body.error.code).toBe('INVALID_CREDENTIALS');

      const kept = await h.db.query('SELECT status FROM users WHERE agency_id = $1 ORDER BY role', [
        agency.id,
      ]);
      expect(kept.rows.map((row) => row.status)).toEqual(['active', 'active']);
    });

    it('BR-13 after reactivation members log in again; old sessions stay ended', async () => {
      const agency = await createAgency();
      const broker = await h.createUser({ role: 'broker', agencyId: agency.id });
      const before = await h.sessionFor(broker.email);
      await h.post(`/admin/agencies/${agency.id}/suspend`, { session, body: { reason: 'Hold' } });
      await h.post(`/admin/agencies/${agency.id}/reactivate`, { session, body: { reason: 'OK' } });

      expect((await h.get('/me', before)).status).toBe(401);
      expect((await h.login(broker.email)).status).toBe(200);
    });
  });
});
