import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  currencyListResponseSchema,
  invitationCheckResponseSchema,
  meResponseSchema,
  type UserRole,
} from '@reih/contracts';
import { messages } from '@reih/i18n';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Inviter, InvitationService } from '../src/modules/identity/index.js';
import { PASSWORD, useIdentityApp } from './support/identity-app.js';

const NEW_PASSWORD = 'a-brand-new-password-9';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const jpeg = (bytes: number) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.max(bytes - 4, 0), 1)]);
const png = (bytes: number) =>
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(Math.max(bytes - 8, 0), 2),
  ]);
const gif = (bytes: number) =>
  Buffer.concat([Buffer.from('GIF89a', 'latin1'), Buffer.alloc(Math.max(bytes - 6, 0), 3)]);
const TWO_MB = 2 * 1024 * 1024;

describe('identity: invitations, activation, password, profile and preferences', () => {
  const h = useIdentityApp({ mailpit: true });
  const { createUser, get, post, send, login, sessionFor, mailTo, mailCount, linkToken } = h;

  let platformAdmin: Inviter;
  let agencyAdmin: Inviter;

  beforeAll(async () => {
    const staff = await createUser({ role: 'platform_admin' });
    platformAdmin = { id: staff.id, role: 'platform_admin', agencyId: null };
    const admin = await createUser({ role: 'agency_admin', language: 'ar' });
    agencyAdmin = { id: admin.id, role: 'agency_admin', agencyId: h.agencies.active };
  });

  const invitations = () => h.app.get(InvitationService);
  let emailCounter = 0;
  const freshEmail = () => `invitee${(emailCounter += 1)}-${randomUUID().slice(0, 6)}@reih.test`;

  const errorOf = (response: request.Response) => response.body.error?.code as string | undefined;
  const userRow = async (id: string) =>
    (
      await h.db.query(
        `SELECT status, password_hash, terms_version, terms_accepted_at, failed_login_count,
                locked_until, pref_language, role, agency_id, photo_path
           FROM users WHERE id = $1`,
        [id],
      )
    ).rows[0];

  /** Invites a broker into the active agency and returns the emailed token. */
  async function invitedBroker(language?: 'ar' | 'en') {
    const email = freshEmail();
    const result = await invitations().invite(
      agencyAdmin,
      email,
      'broker',
      h.agencies.active,
      language,
    );
    const token = linkToken(await mailTo(email));
    return { ...result, email, token };
  }

  const activate = (token: string, password = PASSWORD, acceptTerms: unknown = true) =>
    post('/auth/activate', { body: { token, password, acceptTerms } });

  // ---------------------------------------------------------------- FR-ACC-01 invitations

  describe('FR-ACC-01 invitations', () => {
    it('FR-ACC-01 an invitation emails a single-use link in English and stores only its hash', async () => {
      const email = freshEmail();
      const { invitationId, userId } = await invitations().invite(
        agencyAdmin,
        email,
        'broker',
        h.agencies.active,
        'en',
      );
      const message = await mailTo(email);
      expect(message.Subject).toBe(messages.en.email.invitation.subject);
      expect(message.HTML).toContain('dir="ltr"');
      expect(message.Text).toContain('https://app.localhost/en/activate#token=');
      const token = linkToken(message);

      const { rows } = await h.db.query(
        `SELECT token_hash, role, agency_id, invited_by,
                extract(epoch FROM expires_at - now()) / 86400 AS days
           FROM invitations WHERE id = $1`,
        [invitationId],
      );
      expect(rows[0].token_hash).toBe(sha256(token));
      expect(JSON.stringify(rows)).not.toContain(token);
      expect(Number(rows[0].days)).toBeGreaterThan(6.99);
      expect(Number(rows[0].days)).toBeLessThanOrEqual(7);
      expect(rows[0]).toMatchObject({
        role: 'broker',
        agency_id: h.agencies.active,
        invited_by: agencyAdmin.id,
      });
      expect(await userRow(userId)).toMatchObject({
        status: 'invited',
        password_hash: null,
        pref_language: 'en',
      });
    });

    it('FR-ACC-01 the invitation is in Arabic, right to left, by default in the inviter language', async () => {
      // agencyAdmin's own language is Arabic, and no language is passed.
      const email = freshEmail();
      const { userId } = await invitations().invite(
        agencyAdmin,
        email,
        'broker',
        h.agencies.active,
      );
      const message = await mailTo(email);
      expect(message.Subject).toBe(messages.ar.email.invitation.subject);
      expect(message.HTML).toContain('dir="rtl"');
      expect(message.Text).toContain('https://app.localhost/ar/activate#token=');
      expect((await userRow(userId)).pref_language).toBe('ar');
    });

    it('FR-ADM-03 a staff invitation links to the Operations Dashboard', async () => {
      const email = freshEmail();
      await invitations().invite(platformAdmin, email, 'data_operator', null, 'en');
      expect((await mailTo(email)).Text).toContain('https://ops.localhost/en/activate#token=');
    });

    it('FR-ADM-06 the validity comes from settings.invitation_validity_days', async () => {
      await h.db.query('UPDATE settings SET invitation_validity_days = 3');
      try {
        const email = freshEmail();
        const { invitationId } = await invitations().invite(
          platformAdmin,
          email,
          'platform_admin',
          null,
          'en',
        );
        const { rows } = await h.db.query(
          `SELECT extract(epoch FROM expires_at - now()) / 86400 AS days FROM invitations
            WHERE id = $1`,
          [invitationId],
        );
        expect(Math.round(Number(rows[0].days))).toBe(3);
        expect((await mailTo(email)).Text).toContain(
          messages.en.email.invitation.validity.replace('{count}', '3'),
        );
      } finally {
        await h.db.query('UPDATE settings SET invitation_validity_days = 7');
      }
    });

    it('FR-AGY-02 inviting an email already active in another agency is refused', async () => {
      const elsewhere = await createUser({ agencyId: h.agencies.other });
      await expect(
        invitations().invite(agencyAdmin, elsewhere.email, 'broker', h.agencies.active),
      ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED', status: 409 });
    });

    it('FR-AGY-02 a deactivated user is not invited again, so no user moves between agencies', async () => {
      const former = await createUser({ status: 'deactivated', agencyId: h.agencies.other });
      await expect(
        invitations().invite(agencyAdmin, former.email.toUpperCase(), 'broker', h.agencies.active),
      ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_REGISTERED' });
      expect((await userRow(former.id)).agency_id).toBe(h.agencies.other);
    });

    it('FR-AGY-02 a pending invitation is refused; after a cancel the same email can be invited again', async () => {
      const { invitationId, userId, email } = await invitedBroker('en');
      await expect(
        invitations().invite(platformAdmin, email, 'agency_admin', h.agencies.other),
      ).rejects.toMatchObject({ code: 'INVITATION_PENDING', status: 409 });

      await invitations().cancel(agencyAdmin, invitationId);
      const again = await invitations().invite(
        platformAdmin,
        email,
        'agency_admin',
        h.agencies.other,
        'en',
      );
      expect(again.userId).toBe(userId);
      expect(await userRow(userId)).toMatchObject({
        role: 'agency_admin',
        agency_id: h.agencies.other,
      });
    });

    it('FR-ACC-04 only the right roles invite, and an Agency Admin only into their own agency', async () => {
      const broker = await createUser();
      const refusals: [Inviter, UserRole, string | null][] = [
        [
          { id: broker.id, role: 'broker', agencyId: h.agencies.active },
          'broker',
          h.agencies.active,
        ],
        [agencyAdmin, 'broker', h.agencies.other],
        [agencyAdmin, 'data_operator', null],
        [platformAdmin, 'broker', h.agencies.active],
      ];
      for (const [by, role, agencyId] of refusals) {
        await expect(invitations().invite(by, freshEmail(), role, agencyId)).rejects.toMatchObject({
          code: 'FORBIDDEN',
          status: 403,
        });
      }
      await expect(
        invitations().invite(platformAdmin, freshEmail(), 'agency_admin', randomUUID()),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    it('FR-AGY-02 resend sends a new link and the old one stops working', async () => {
      const { invitationId, email, token: oldToken } = await invitedBroker('en');
      await h.db.query(
        `UPDATE invitations SET expires_at = now() + interval '1 hour' WHERE id = $1`,
        [invitationId],
      );
      await invitations().resend(agencyAdmin, invitationId);
      await expect.poll(() => mailCount(email), { timeout: 10_000 }).toBe(2);
      const newToken = linkToken(await mailTo(email));

      expect(newToken).not.toBe(oldToken);
      expect(errorOf(await get(`/auth/invitations/${oldToken}`).expect(404))).toBe(
        'INVITATION_NOT_FOUND',
      );
      await get(`/auth/invitations/${newToken}`).expect(200);
      const { rows } = await h.db.query(
        `SELECT extract(epoch FROM expires_at - now()) / 86400 AS days FROM invitations
          WHERE id = $1`,
        [invitationId],
      );
      expect(Number(rows[0].days)).toBeGreaterThan(6.99);
    });

    it('NFR-09 another agency cannot resend or cancel an invitation, which stays hidden', async () => {
      const { invitationId } = await invitedBroker('en');
      const otherAdmin: Inviter = {
        id: (await createUser({ role: 'agency_admin', agencyId: h.agencies.other })).id,
        role: 'agency_admin',
        agencyId: h.agencies.other,
      };
      await expect(invitations().resend(otherAdmin, invitationId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      await expect(invitations().cancel(otherAdmin, invitationId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      // A Platform Admin manages staff and first-admin invitations, not an agency's brokers.
      await expect(invitations().resend(platformAdmin, invitationId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('FR-AGY-02 a used or cancelled invitation cannot be resent', async () => {
      const used = await invitedBroker('en');
      expect((await activate(used.token)).status).toBe(204);
      await expect(invitations().resend(agencyAdmin, used.invitationId)).rejects.toMatchObject({
        code: 'INVITATION_USED',
      });
      const cancelled = await invitedBroker('en');
      await invitations().cancel(agencyAdmin, cancelled.invitationId);
      await expect(invitations().resend(agencyAdmin, cancelled.invitationId)).rejects.toMatchObject(
        { code: 'INVITATION_CANCELLED' },
      );
    });
  });

  // ---------------------------------------------------------------- FR-ACC-01 activation

  describe('FR-ACC-01 activation', () => {
    it('FR-ACC-01 a valid link shows the email, role, expiry and terms version', async () => {
      const { email, token } = await invitedBroker('en');
      const response = await get(`/auth/invitations/${token}`).expect(200);
      expect(invitationCheckResponseSchema.parse(response.body)).toMatchObject({
        email,
        role: 'broker',
        termsVersion: '1.0',
      });
    });

    it('FR-ACC-01 activation stores the accepted terms version and time, and the user can log in', async () => {
      await h.db.query(`UPDATE settings SET current_terms_version = '2.1'`);
      try {
        const { userId, email, token } = await invitedBroker('en');
        expect((await activate(token)).status).toBe(204);

        const user = await userRow(userId);
        expect(user).toMatchObject({ status: 'active', terms_version: '2.1' });
        expect(Date.now() - new Date(user.terms_accepted_at).getTime()).toBeLessThan(60_000);
        expect(user.password_hash).toMatch(/^\$argon2id\$/);
        expect((await login(email)).status).toBe(200);
      } finally {
        await h.db.query(`UPDATE settings SET current_terms_version = '1.0'`);
      }
    });

    it('FR-ACC-01 an expired link is refused with a clear message', async () => {
      const { invitationId, userId, token } = await invitedBroker('en');
      // Move the expiry into the past instead of waiting for it.
      await h.db.query(
        `UPDATE invitations SET expires_at = now() - interval '1 second' WHERE id = $1`,
        [invitationId],
      );
      const checked = await get(`/auth/invitations/${token}`).set('Accept-Language', 'ar');
      expect(checked.status).toBe(410);
      expect(checked.body.error).toEqual({
        code: 'INVITATION_EXPIRED',
        message: messages.ar.errors.INVITATION_EXPIRED,
        details: {},
      });
      const activated = await activate(token);
      expect(activated.status).toBe(410);
      expect(activated.body.error.message).toBe(messages.en.errors.INVITATION_EXPIRED);
      expect((await userRow(userId)).status).toBe('invited');
    });

    it('FR-ACC-01 a cancelled link is refused with a clear message', async () => {
      const { invitationId, token } = await invitedBroker('en');
      await invitations().cancel(agencyAdmin, invitationId);
      expect(errorOf(await get(`/auth/invitations/${token}`).expect(410))).toBe(
        'INVITATION_CANCELLED',
      );
      expect(errorOf(await activate(token))).toBe('INVITATION_CANCELLED');
    });

    it('FR-ACC-01 a used link is refused with a clear message', async () => {
      const { token } = await invitedBroker('en');
      expect((await activate(token)).status).toBe(204);
      expect(errorOf(await get(`/auth/invitations/${token}`).expect(410))).toBe('INVITATION_USED');
      const again = await activate(token, NEW_PASSWORD);
      expect(again.status).toBe(410);
      expect(errorOf(again)).toBe('INVITATION_USED');
    });

    it('FR-ACC-01 two activations with the same link: exactly one succeeds', async () => {
      const { token } = await invitedBroker('en');
      const results = await Promise.all([activate(token), activate(token, NEW_PASSWORD)]);
      expect(results.map((r) => r.status).sort()).toEqual([204, 410]);
    });

    it('FR-ACC-01 an unknown or malformed link is not found', async () => {
      expect(errorOf(await get(`/auth/invitations/${'A'.repeat(43)}`).expect(404))).toBe(
        'INVITATION_NOT_FOUND',
      );
      expect(errorOf(await get('/auth/invitations/not-a-token').expect(404))).toBe(
        'INVITATION_NOT_FOUND',
      );
    });

    it('FR-ACC-01 activation needs a password of at least 10 characters', async () => {
      const { userId, token } = await invitedBroker('en');
      const response = await activate(token, 'nine-char');
      expect(response.status).toBe(400);
      expect(errorOf(response)).toBe('VALIDATION_FAILED');
      expect((await userRow(userId)).status).toBe('invited');
      expect((await activate(token, 'ten-chars!')).status).toBe(204);
    });

    it('FR-ACC-01 activation needs the terms accepted', async () => {
      const { userId, token } = await invitedBroker('en');
      for (const body of [
        { token, password: PASSWORD },
        { token, password: PASSWORD, acceptTerms: false },
      ]) {
        const response = await post('/auth/activate', { body });
        expect(response.status).toBe(400);
        expect(errorOf(response)).toBe('TERMS_NOT_ACCEPTED');
      }
      expect(await userRow(userId)).toMatchObject({ status: 'invited', terms_version: null });
    });

    it('SRS 3.3 activation needs the CSRF token', async () => {
      const { token } = await invitedBroker('en');
      const response = await request(h.server())
        .post(h.path('/auth/activate'))
        .send({ token, password: PASSWORD, acceptTerms: true });
      expect(response.status).toBe(403);
      expect(errorOf(response)).toBe('CSRF_TOKEN_INVALID');
    });
  });

  // ---------------------------------------------------------------- FR-ACC-03 password reset

  describe('FR-ACC-03 password reset', () => {
    const forgot = (email: string, ip?: string) =>
      post('/auth/forgot', { body: { email }, ...(ip ? { ip } : {}) });
    const reset = (token: string, password = NEW_PASSWORD) =>
      post('/auth/reset', { body: { token, password } });

    async function resetTokenFor(email: string): Promise<string> {
      expect((await forgot(email)).status).toBe(202);
      return linkToken(await mailTo(email));
    }

    it('FR-ACC-03 the reset form answers the same way for known and unknown emails', async () => {
      const known = await createUser();
      const unknown = `nobody-${randomUUID().slice(0, 8)}@reih.test`;

      const timed = async (email: string) => {
        const started = performance.now();
        const response = await forgot(email);
        return { response, ms: performance.now() - started };
      };
      const knownRuns = [];
      const unknownRuns = [];
      for (let run = 0; run < 3; run += 1) {
        unknownRuns.push(await timed(unknown));
        knownRuns.push(await timed(known.email));
        await h.redis.flushall();
      }
      for (const { response } of [...knownRuns, ...unknownRuns]) {
        expect(response.status).toBe(202);
        expect(response.body).toEqual(unknownRuns[0]?.response.body);
        expect(response.text).toBe(unknownRuns[0]?.response.text);
      }
      // Nothing is looked up before the answer, so both take about as long.
      const median = (runs: { ms: number }[]) =>
        runs.map((r) => r.ms).sort((a, b) => a - b)[1] as number;
      expect(Math.abs(median(knownRuns) - median(unknownRuns))).toBeLessThan(75);

      // Only the known email gets a message; the unknown one was handled first and sent nothing.
      await mailTo(known.email);
      expect(await mailCount(unknown)).toBe(0);
    });

    it('FR-ACC-03 the reset email is in the user language, with a 60-minute link', async () => {
      const arabic = await createUser({ language: 'ar' });
      const english = await createUser({ role: 'data_operator', language: 'en' });
      await forgot(arabic.email);
      await forgot(english.email);

      const ar = await mailTo(arabic.email);
      expect(ar.Subject).toBe(messages.ar.email.passwordReset.subject);
      expect(ar.HTML).toContain('dir="rtl"');
      expect(ar.Text).toContain('https://app.localhost/ar/reset-password#token=');
      const en = await mailTo(english.email);
      expect(en.Subject).toBe(messages.en.email.passwordReset.subject);
      expect(en.Text).toContain('https://ops.localhost/en/reset-password#token=');
      expect(en.Text).toContain(messages.en.email.passwordReset.validity.replace('{count}', '60'));

      const { rows } = await h.db.query(
        `SELECT token_hash, extract(epoch FROM expires_at - now()) / 60 AS minutes
           FROM password_reset_tokens WHERE user_id = $1`,
        [english.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].token_hash).toBe(sha256(linkToken(en)));
      expect(Number(rows[0].minutes)).toBeGreaterThan(59.9);
      expect(Number(rows[0].minutes)).toBeLessThanOrEqual(60);
    });

    it('FR-ACC-03 a used link fails', async () => {
      const user = await createUser();
      const token = await resetTokenFor(user.email);
      expect((await reset(token)).status).toBe(204);
      const again = await reset(token, 'yet-another-password');
      expect(again.status).toBe(410);
      expect(errorOf(again)).toBe('RESET_LINK_USED');
      expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
    });

    it('FR-ACC-03 an expired link fails', async () => {
      const user = await createUser();
      const token = await resetTokenFor(user.email);
      // Move the expiry into the past instead of waiting 60 minutes.
      await h.db.query(
        `UPDATE password_reset_tokens SET expires_at = now() - interval '1 second'
          WHERE user_id = $1`,
        [user.id],
      );
      const response = await reset(token);
      expect(response.status).toBe(410);
      expect(errorOf(response)).toBe('RESET_LINK_EXPIRED');
      expect((await login(user.email)).status).toBe(200);
    });

    it('FR-ACC-03 an unknown link fails, and a newer request voids the earlier link', async () => {
      expect(errorOf(await reset('A'.repeat(43)))).toBe('RESET_LINK_INVALID');
      expect(errorOf(await reset('short'))).toBe('RESET_LINK_INVALID');

      const user = await createUser();
      const first = await resetTokenFor(user.email);
      await forgot(user.email);
      await expect.poll(() => mailCount(user.email), { timeout: 10_000 }).toBe(2);
      const second = linkToken(await mailTo(user.email));
      expect(errorOf(await reset(first))).toBe('RESET_LINK_INVALID');
      expect((await reset(second)).status).toBe(204);
    });

    it('FR-ACC-03 a reset ends all the user sessions and clears the lock', async () => {
      const user = await createUser();
      const laptop = await sessionFor(user.email);
      const phone = await sessionFor(user.email);
      const token = await resetTokenFor(user.email);
      await h.db.query(
        `UPDATE users SET failed_login_count = 3, locked_until = now() + interval '10 minutes'
          WHERE id = $1`,
        [user.id],
      );

      expect((await reset(token)).status).toBe(204);
      await get('/me', laptop).expect(401);
      await get('/me', phone).expect(401);
      expect(await userRow(user.id)).toMatchObject({ failed_login_count: 0, locked_until: null });
      expect((await login(user.email, PASSWORD)).status).toBe(401);
      expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
    });

    it('FR-ACC-03 a new password follows the FR-ACC-01 rule', async () => {
      const user = await createUser();
      const token = await resetTokenFor(user.email);
      expect(errorOf(await reset(token, 'too-short'))).toBe('VALIDATION_FAILED');
      expect((await reset(token)).status).toBe(204);
    });

    it('FR-ACC-03 no reset email for an account that cannot log in', async () => {
      const deactivated = await createUser({ status: 'deactivated' });
      const invited = await createUser({ status: 'invited', withPassword: false });
      const active = await createUser();
      await forgot(deactivated.email);
      await forgot(invited.email);
      await forgot(active.email);
      await mailTo(active.email);
      expect(await mailCount(deactivated.email)).toBe(0);
      expect(await mailCount(invited.email)).toBe(0);
    });
  });

  // ---------------------------------------------------------------- FR-ACC-03 password change

  describe('FR-ACC-03 password change', () => {
    const change = (session: string, currentPassword: string, newPassword = NEW_PASSWORD) =>
      post('/me/password', { session, body: { currentPassword, newPassword } });

    it('FR-ACC-03 a password change requires the current password', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      const refused = await change(session, 'not-my-password');
      expect(refused.status).toBe(400);
      expect(errorOf(refused)).toBe('CURRENT_PASSWORD_INCORRECT');
      expect((await userRow(user.id)).failed_login_count).toBe(1);

      expect((await change(session, PASSWORD)).status).toBe(204);
      expect((await userRow(user.id)).failed_login_count).toBe(0);
      expect((await login(user.email, NEW_PASSWORD)).status).toBe(200);
    });

    it('FR-ACC-03 a change ends the other sessions and keeps this one', async () => {
      const user = await createUser();
      const here = await sessionFor(user.email);
      const elsewhere = await sessionFor(user.email);
      expect((await change(here, PASSWORD)).status).toBe(204);
      await get('/me', here).expect(200);
      await get('/me', elsewhere).expect(401);
    });

    it('FR-ACC-02 a wrong current password counts toward the lockout; while locked no guess is checked', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        expect(errorOf(await change(session, 'wrong-guess-123'))).toBe(
          'CURRENT_PASSWORD_INCORRECT',
        );
      }
      expect((await userRow(user.id)).locked_until).not.toBeNull();
      await h.redis.flushall();

      expect(errorOf(await change(session, PASSWORD))).toBe('CURRENT_PASSWORD_INCORRECT');
      // The session that made the attempts stays open; only login is locked.
      await get('/me', session).expect(200);
      expect((await login(user.email)).status).toBe(401);
    });

    it('NFR-08 password change is limited to 5 attempts per user in 15 minutes', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await change(session, 'wrong-guess-123');
      }
      expect((await change(session, PASSWORD)).status).toBe(429);
    });
  });

  // ---------------------------------------------------------------- FR-ACC-05 profile and photo

  describe('FR-ACC-05 profile', () => {
    const patch = (session: string, body: object) => send('patch', '/me', { session, body });

    it('FR-ACC-05 a changed mobile number is saved and returned', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      const response = await patch(session, {
        fullName: '  Layla Haddad  ',
        mobile: '+971501112233',
        whatsapp: '+971502223344',
        jobTitle: 'Senior Broker',
        brn: 'BRN-12345',
      });
      expect(response.status).toBe(200);
      expect(meResponseSchema.parse(response.body).user).toMatchObject({
        fullName: 'Layla Haddad',
        mobile: '+971501112233',
        whatsapp: '+971502223344',
        jobTitle: 'Senior Broker',
        brn: 'BRN-12345',
      });

      expect((await patch(session, { mobile: '+971509998877' })).status).toBe(200);
      const me = (await get('/me', session).expect(200)).body;
      expect(me.user.mobile).toBe('+971509998877');
      expect(me.user.fullName).toBe('Layla Haddad');
    });

    it('FR-ACC-05 the BRN and job title are optional and can be cleared', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      await patch(session, { brn: 'BRN-1', jobTitle: 'Broker' });
      const cleared = await patch(session, { brn: null, jobTitle: '' });
      expect(cleared.body.user).toMatchObject({ brn: null, jobTitle: null });
    });

    it('FR-ACC-05 invalid fields are refused and nothing changes', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      for (const body of [
        { mobile: '0501234567' },
        { fullName: '' },
        { brn: 'x'.repeat(31) },
        { role: 'platform_admin' },
        { email: 'other@reih.test' },
      ]) {
        const response = await patch(session, body);
        expect(response.status, JSON.stringify(body)).toBe(400);
        expect(errorOf(response)).toBe('VALIDATION_FAILED');
      }
      expect(await userRow(user.id)).toMatchObject({ role: 'broker' });
    });
  });

  describe('FR-ACC-05 photo', () => {
    const upload = (session: string, content: Buffer, filename: string, field = 'photo') =>
      send('put', '/me/photo', { session, attach: { field, content, filename } });
    const photos = () => {
      const dir = join(h.filesDir, 'profile-photos');
      return existsSync(dir) ? readdirSync(dir) : [];
    };
    const tempFiles = () => {
      const dir = join(h.filesDir, '.tmp');
      return existsSync(dir) ? readdirSync(dir) : [];
    };

    it('FR-ACC-05 a JPEG or PNG photo is stored, served with its type, and the old one removed', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);

      const first = await upload(session, jpeg(10_000), 'me.jpg');
      expect(first.status).toBe(200);
      expect(first.body.user.photoUrl).toMatch(/^\/api\/v1\/me\/photo\?v=[\w-]+$/);
      const firstKey = (await userRow(user.id)).photo_path as string;
      expect(firstKey).toMatch(/^profile-photos\/[\w-]+\.jpg$/);

      const served = await get('/me/photo', session).buffer(true).expect(200);
      expect(served.headers['content-type']).toBe('image/jpeg');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      expect(served.headers['cache-control']).toBe('private');
      expect(Buffer.compare(served.body as Buffer, jpeg(10_000))).toBe(0);

      const second = await upload(session, png(5_000), 'me.png');
      expect(second.status).toBe(200);
      expect(second.body.user.photoUrl).not.toBe(first.body.user.photoUrl);
      const secondKey = (await userRow(user.id)).photo_path as string;
      expect(photos()).toContain(secondKey.split('/')[1]);
      expect(photos()).not.toContain(firstKey.split('/')[1]);
      expect((await get('/me/photo', session).expect(200)).headers['content-type']).toBe(
        'image/png',
      );
    });

    it('FR-ACC-05 a photo of exactly 2 MB is accepted; one byte more is refused and nothing stays', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      expect((await upload(session, png(TWO_MB), 'max.png')).status).toBe(200);
      const kept = (await userRow(user.id)).photo_path;
      const before = photos();

      const tooLarge = await upload(session, png(TWO_MB + 1), 'big.png');
      expect(tooLarge.status).toBe(413);
      expect(errorOf(tooLarge)).toBe('FILE_TOO_LARGE');
      expect(photos()).toEqual(before);
      expect(tempFiles()).toEqual([]);
      expect((await userRow(user.id)).photo_path).toBe(kept);
    });

    it('FR-ACC-05 the real type decides, never the file name', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      const disguised = await upload(session, gif(2_000), 'photo.png');
      expect(disguised.status).toBe(415);
      expect(errorOf(disguised)).toBe('FILE_TYPE_NOT_ALLOWED');
      expect((await userRow(user.id)).photo_path).toBeNull();

      const renamed = await upload(session, png(2_000), 'photo.gif');
      expect(renamed.status).toBe(200);
      expect((await userRow(user.id)).photo_path).toMatch(/\.png$/);
    });

    it('FR-ACC-05 an upload without the photo field is refused', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      const wrongField = await upload(session, png(1_000), 'me.png', 'avatar');
      expect(wrongField.status).toBe(400);
      const notMultipart = await send('put', '/me/photo', { session, body: { photo: 'x' } });
      expect(notMultipart.status).toBe(400);
      expect((await userRow(user.id)).photo_path).toBeNull();
    });

    it('FR-ACC-05 a photo can be removed', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      await upload(session, jpeg(3_000), 'me.jpg');
      const key = (await userRow(user.id)).photo_path as string;

      const removed = await send('delete', '/me/photo', { session });
      expect(removed.status).toBe(200);
      expect(removed.body.user.photoUrl).toBeNull();
      expect(photos()).not.toContain(key.split('/')[1]);
      expect(errorOf(await get('/me/photo', session).expect(404))).toBe('NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------- FR-ACC-06 preferences

  describe('FR-ACC-06 preferences', () => {
    beforeAll(async () => {
      await h.db.query(
        `INSERT INTO currencies (code, symbol, name_ar, name_en, is_enabled) VALUES
           ('USD', '$', 'دولار أمريكي', 'US Dollar', true),
           ('EUR', '€', 'يورو', 'Euro', false)`,
      );
    });
    const patch = (session: string, body: object) =>
      send('patch', '/me/preferences', { session, body });

    it('FR-ACC-06 the choices are saved and survive logout', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      const response = await patch(session, { language: 'ar', currency: 'usd', areaUnit: 'sqft' });
      expect(response.status).toBe(200);
      expect(response.body.preferences).toEqual({
        language: 'ar',
        currency: 'USD',
        areaUnit: 'sqft',
      });

      expect((await post('/auth/logout', { session })).status).toBe(204);
      const again = await login(user.email);
      expect(again.status).toBe(200);
      expect(meResponseSchema.parse(again.body).preferences).toEqual({
        language: 'ar',
        currency: 'USD',
        areaUnit: 'sqft',
      });
    });

    it('FR-ACC-06 one choice can change alone', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      const response = await patch(session, { areaUnit: 'sqft' });
      expect(response.body.preferences).toEqual({
        language: 'en',
        currency: 'AED',
        areaUnit: 'sqft',
      });
    });

    it('FR-ACC-06 GET /currencies lists the enabled currencies, AED first, for every role', async () => {
      for (const role of ['broker', 'agency_admin', 'data_operator', 'platform_admin'] as const) {
        const user = await createUser({ role });
        const response = await get('/currencies', await sessionFor(user.email));
        expect(response.status, role).toBe(200);
        expect(currencyListResponseSchema.parse(response.body)).toEqual({
          items: [
            { code: 'AED', symbol: 'د.إ', nameAr: 'درهم إماراتي', nameEn: 'UAE Dirham' },
            { code: 'USD', symbol: '$', nameAr: 'دولار أمريكي', nameEn: 'US Dollar' },
          ],
          total: 2,
          page: 1,
          pageSize: 20,
        });
      }
    });

    it('FR-ACC-06 GET /currencies pages with ?page&pageSize, at most 100', async () => {
      const session = await sessionFor((await createUser()).email);
      const second = await get('/currencies?page=2&pageSize=1', session).expect(200);
      expect(second.body).toEqual({
        items: [{ code: 'USD', symbol: '$', nameAr: 'دولار أمريكي', nameEn: 'US Dollar' }],
        total: 2,
        page: 2,
        pageSize: 1,
      });
      expect(errorOf(await get('/currencies?pageSize=101', session).expect(400))).toBe(
        'VALIDATION_FAILED',
      );
    });

    it('NFR-09 GET /currencies needs a session', async () => {
      expect(errorOf(await get('/currencies').expect(401))).toBe('UNAUTHORIZED');
    });

    it('FR-ACC-06 a currency that is not enabled is refused', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      for (const currency of ['EUR', 'XYZ']) {
        const response = await patch(session, { currency });
        expect(response.status).toBe(400);
        expect(errorOf(response)).toBe('CURRENCY_NOT_ENABLED');
      }
      expect(errorOf(await patch(session, { language: 'fr' }))).toBe('VALIDATION_FAILED');
      expect((await get('/me', session).expect(200)).body.preferences.currency).toBe('AED');
    });
  });

  // ---------------------------------------------------------------- NFR-08, NFR-09

  describe('NFR-08 and NFR-09', () => {
    it('NFR-09 every /me endpoint needs a session', async () => {
      await get('/me/photo').expect(401);
      for (const [method, p] of [
        ['patch', '/me'],
        ['patch', '/me/preferences'],
        ['post', '/me/password'],
        ['put', '/me/photo'],
        ['delete', '/me/photo'],
      ] as const) {
        expect((await send(method, p, { body: {} })).status, `${method} ${p}`).toBe(401);
      }
    });

    it('NFR-09 every role edits only its own account', async () => {
      const bystander = await createUser();
      const before = await userRow(bystander.id);
      for (const role of ['broker', 'agency_admin', 'data_operator', 'platform_admin'] as const) {
        const user = await createUser({ role });
        const session = await sessionFor(user.email);
        const response = await send('patch', '/me', { session, body: { jobTitle: role } });
        expect(response.status, role).toBe(200);
        expect(response.body.user.id).toBe(user.id);
      }
      expect(await userRow(bystander.id)).toEqual(before);
    });

    it('NFR-08 the per-email forgot limit is 3, alike for unknown emails', async () => {
      const known = await createUser();
      const run = async (email: string) => {
        const statuses: number[] = [];
        for (let attempt = 0; attempt < 4; attempt += 1) {
          statuses.push(
            (await post('/auth/forgot', { body: { email }, ip: `203.0.113.${attempt}` })).status,
          );
        }
        return statuses;
      };
      const forUnknown = await run(`nobody-${randomUUID().slice(0, 8)}@reih.test`);
      expect(forUnknown).toEqual([202, 202, 202, 429]);
      expect(await run(known.email)).toEqual(forUnknown);
    });

    it('NFR-08 the per-token limits stop guessing on one link', async () => {
      const token = 'B'.repeat(43);
      const resets = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        resets.push(
          (
            await post('/auth/reset', {
              body: { token, password: NEW_PASSWORD },
              ip: `198.51.100.${attempt}`,
            })
          ).status,
        );
      }
      expect(resets).toEqual([400, 400, 400, 400, 400, 429]);
    });

    it('NFR-08 the log holds no invitation or reset token and no password', async () => {
      const invited = await invitedBroker('en');
      await get(`/auth/invitations/${invited.token}`).expect(200);
      await activate(invited.token, NEW_PASSWORD);

      const user = await createUser();
      await post('/auth/forgot', { body: { email: user.email } });
      const resetToken = linkToken(await mailTo(user.email));
      await post('/auth/reset', { body: { token: resetToken, password: NEW_PASSWORD } });

      await expect
        .poll(() => h.logLines.join('\n'))
        .toContain(h.path('/auth/invitations/[Redacted]'));
      const log = h.logLines.join('\n');
      for (const secret of [invited.token, resetToken, NEW_PASSWORD, PASSWORD]) {
        expect(log).not.toContain(secret);
      }
    });
  });
});
