import { createHash, randomUUID } from 'node:crypto';
import { Controller, Get, Module, Post } from '@nestjs/common';
import { meResponseSchema } from '@reih/contracts';
import { messages } from '@reih/i18n';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { AgencyService } from '../src/modules/agency/index.js';
import { Roles } from '../src/shared/http/index.js';
import { AgencySuspended, EventBus, MemberDeactivated } from '../src/shared/events/index.js';
import { CSRF_COOKIE, PASSWORD, SESSION_COOKIE, useIdentityApp } from './support/identity-app.js';

/** Test-only routes with each kind of role check. Registered here, never in AppModule. */
@Controller('probe')
class RoleProbeController {
  @Roles('platform_admin')
  @Get('platform-admin')
  platformAdmin() {
    return { ok: true };
  }

  @Roles('broker')
  @Get('broker')
  broker() {
    return { ok: true };
  }

  @Roles('agency_admin')
  @Get('agency-admin')
  agencyAdmin() {
    return { ok: true };
  }

  @Roles('broker')
  @Post('broker-action')
  brokerAction() {
    return { ok: true };
  }

  @Get('undeclared')
  undeclared() {
    return { ok: true };
  }
}

@Module({ controllers: [RoleProbeController] })
class RoleProbeModule {}

describe('identity: login, sessions, CSRF and roles', () => {
  const h = useIdentityApp({ modules: [RoleProbeModule] });
  const {
    createAgency,
    createUser,
    server,
    path,
    setCookie,
    cookiePair,
    tokenOf,
    csrf,
    post,
    login,
    sessionFor,
    get,
    sessionRow,
    logEntries,
  } = h;

  // ---------------------------------------------------------------- FR-ACC-02

  describe('FR-ACC-02 login and logout', () => {
    it('FR-ACC-02 login sets a Secure, HttpOnly, SameSite=Lax browser-session cookie and stores only its hash', async () => {
      const user = await createUser();
      const response = await login(user.email);
      expect(response.status).toBe(200);

      const cookie = setCookie(response, SESSION_COOKIE) as string;
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; SameSite=Lax/);
      expect(cookie).toMatch(/; Path=\//);
      expect(cookie).not.toMatch(/Max-Age|Expires/i);

      const token = tokenOf(cookie.split(';')[0] as string);
      expect(Buffer.from(token, 'base64url')).toHaveLength(32);
      const rows = await h.db.query<{ token_hash: string }>(
        'SELECT token_hash FROM sessions WHERE user_id = $1',
        [user.id],
      );
      expect(rows.rows).toEqual([{ token_hash: createHash('sha256').update(token).digest('hex') }]);

      const me = meResponseSchema.parse(response.body);
      expect(me.user.id).toBe(user.id);
      const { rows: users } = await h.db.query('SELECT last_login_at FROM users WHERE id = $1', [
        user.id,
      ]);
      expect(users[0].last_login_at).not.toBeNull();
    });

    it('FR-ACC-02 logout ends the session on the server', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      await get('/me', session).expect(200);

      const response = await post('/auth/logout', { session });
      expect(response.status).toBe(204);
      expect(setCookie(response, SESSION_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
      expect((await sessionRow(session))?.ended_at).not.toBeNull();
      // The browser's copy of the cookie no longer opens anything.
      await get('/me', session).expect(401);
    });

    it('FR-ACC-02 logout without a session answers the same', async () => {
      expect((await post('/auth/logout')).status).toBe(204);
    });

    it('FR-ACC-02 the login error does not reveal whether the email exists', async () => {
      const known = await createUser();
      const locked = await createUser();
      await h.db.query(
        `UPDATE users SET locked_until = now() + interval '10 minutes' WHERE id = $1`,
        [locked.id],
      );
      const deactivated = await createUser({ status: 'deactivated' });
      const invited = await createUser({ status: 'invited', withPassword: false });
      const suspended = await createUser({ agencyId: h.agencies.suspended });
      const staffDeactivated = await createUser({ role: 'data_operator', status: 'deactivated' });

      const attempts = {
        unknownEmail: () => login('nobody@reih.test'),
        wrongPassword: () => login(known.email, 'wrong-password-123'),
        locked: () => login(locked.email),
        deactivated: () => login(deactivated.email),
        invitedWithoutPassword: () => login(invited.email),
        suspendedAgency: () => login(suspended.email),
        deactivatedStaff: () => login(staffDeactivated.email),
        // A broker or agency_admin without agency_id cannot exist: the users_check constraint
        // refuses the row. AuthService refuses it anyway; see auth.service.test.ts.
      };

      const expected = {
        error: {
          code: 'INVALID_CREDENTIALS',
          message: messages.en.errors.INVALID_CREDENTIALS,
          details: {},
        },
      };
      for (const [name, attempt] of Object.entries(attempts)) {
        const response = await attempt();
        expect(response.status, name).toBe(401);
        expect(response.body, name).toEqual(expected);
        expect(setCookie(response, SESSION_COOKIE), name).toBeUndefined();
      }

      const arabic = await login('nobody@reih.test', PASSWORD, { language: 'ar' });
      expect(arabic.body.error.message).toBe(messages.ar.errors.INVALID_CREDENTIALS);
      const arabicKnown = await login(known.email, 'wrong-password-123', { language: 'ar' });
      expect(arabicKnown.body).toEqual(arabic.body);
    });

    it('FR-ACC-02 five failed attempts lock the account for 15 minutes', async () => {
      const user = await createUser();
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        expect((await login(user.email, 'wrong-password-123')).status).toBe(401);
      }
      const { rows } = await h.db.query<{ minutes: number; failed_login_count: number }>(
        `SELECT extract(epoch FROM locked_until - now()) / 60 AS minutes, failed_login_count
           FROM users WHERE id = $1`,
        [user.id],
      );
      expect(Number(rows[0]?.minutes)).toBeGreaterThan(14.5);
      expect(Number(rows[0]?.minutes)).toBeLessThanOrEqual(15);

      // Locked: even the right password is refused, with the same error.
      const refused = await login(user.email);
      expect(refused.status).toBe(401);
      expect(refused.body.error.code).toBe('INVALID_CREDENTIALS');

      // Move the lock's end into the past instead of waiting 15 minutes.
      await h.db.query(
        `UPDATE users SET locked_until = now() - interval '1 second' WHERE id = $1`,
        [user.id],
      );
      expect((await login(user.email)).status).toBe(200);
      const after = await h.db.query(
        'SELECT failed_login_count, locked_until FROM users WHERE id = $1',
        [user.id],
      );
      expect(after.rows[0]).toEqual({ failed_login_count: 0, locked_until: null });
    });

    it('FR-ACC-02 a successful login clears earlier failed attempts', async () => {
      const user = await createUser();
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await login(user.email, 'wrong-password-123');
      }
      await sessionFor(user.email);
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        await login(user.email, 'wrong-password-123');
      }
      expect((await login(user.email)).status).toBe(200);
    });

    it('FR-ACC-02 a session ends after 8 hours without activity', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      await h.db.query(
        `UPDATE sessions
            SET last_activity_at = now() - interval '8 hours 1 second',
                expires_at = now() - interval '1 second'
          WHERE user_id = $1`,
        [user.id],
      );
      const response = await get('/me', session).expect(401);
      expect(response.body.error.code).toBe('UNAUTHORIZED');
      expect(setCookie(response, SESSION_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('FR-ACC-02 activity moves the 8-hour expiry forward, written at most once a minute', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      const fresh = await sessionRow(session);

      // Within the first minute, a request writes nothing.
      await get('/me', session).expect(200);
      expect(await sessionRow(session)).toEqual(fresh);

      await h.db.query(
        `UPDATE sessions
            SET last_activity_at = now() - interval '7 hours',
                expires_at = now() + interval '1 hour'
          WHERE user_id = $1`,
        [user.id],
      );
      await get('/me', session).expect(200);
      const touched = await sessionRow(session);
      const hoursLeft = ((touched?.expires_at.getTime() ?? 0) - Date.now()) / 3_600_000;
      expect(hoursLeft).toBeGreaterThan(7.9);
      expect(hoursLeft).toBeLessThanOrEqual(8);
      expect(Date.now() - (touched?.last_activity_at.getTime() ?? 0)).toBeLessThan(60_000);
    });

    it('FR-ACC-02 every login creates a new session and ends the one the browser still sent', async () => {
      const user = await createUser();
      const first = await sessionFor(user.email);
      const response = await login(user.email, PASSWORD, { session: first });
      expect(response.status).toBe(200);
      const second = cookiePair(response, SESSION_COOKIE) as string;

      expect(second).not.toBe(first);
      expect((await sessionRow(first))?.ended_at).not.toBeNull();
      await get('/me', first).expect(401);
      await get('/me', second).expect(200);
    });

    it('FR-ACC-02 a login on another device keeps the first session', async () => {
      const user = await createUser();
      const laptop = await sessionFor(user.email);
      const tablet = await sessionFor(user.email);
      await get('/me', laptop).expect(200);
      await get('/me', tablet).expect(200);
    });
  });

  // ---------------------------------------------------------------- SRS 3.3 CSRF

  describe('SRS 3.3 CSRF', () => {
    it('SRS 3.3 GET /auth/csrf sets a __Host- cookie and returns the same token', async () => {
      const response = await request(server()).get(path('/auth/csrf')).expect(200);
      const cookie = setCookie(response, CSRF_COOKIE) as string;
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; Path=\//);
      expect(cookie).toMatch(/; SameSite=Lax/);
      expect(cookie).not.toMatch(/Domain=|Max-Age|Expires/i);
      expect(tokenOf(cookie.split(';')[0] as string)).toBe(response.body.token);

      // A token the browser already has is kept, so other open tabs keep working.
      const again = await request(server())
        .get(path('/auth/csrf'))
        .set('Cookie', cookie.split(';')[0] as string)
        .expect(200);
      expect(again.body.token).toBe(response.body.token);
    });

    it('SRS 3.3 a POST without a matching CSRF token is refused with 403', async () => {
      const user = await createUser();
      const { cookie, token } = await csrf();
      const body = { email: user.email, password: PASSWORD };
      const attempt = (headers: Record<string, string>) =>
        request(server()).post(path('/auth/login')).set(headers).send(body);

      const cases = {
        noTokenAtAll: await attempt({}),
        headerWithoutCookie: await attempt({ 'X-CSRF-Token': token }),
        cookieWithoutHeader: await attempt({ Cookie: cookie }),
        wrongHeader: await attempt({ Cookie: cookie, 'X-CSRF-Token': `${token.slice(0, -1)}x` }),
      };
      for (const [name, response] of Object.entries(cases)) {
        expect(response.status, name).toBe(403);
        expect(response.body.error.code, name).toBe('CSRF_TOKEN_INVALID');
        expect(setCookie(response, SESSION_COOKIE), name).toBeUndefined();
      }
      await attempt({ Cookie: cookie, 'X-CSRF-Token': token }).expect(200);
    });

    it('SRS 3.3 logout without a CSRF token leaves the session open', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      await request(server()).post(path('/auth/logout')).set('Cookie', session).expect(403);
      await get('/me', session).expect(200);
    });
  });

  // ---------------------------------------------------------------- FR-ACC-04

  describe('FR-ACC-04 roles', () => {
    const forbiddenLogs = () => logEntries().filter((entry) => entry.msg === 'Request forbidden');

    it('FR-ACC-04 a wrong role gets 403 and it is logged with user, role and route', async () => {
      const broker = await createUser({ role: 'broker' });
      const session = await sessionFor(broker.email);

      const response = await get('/probe/platform-admin', session).expect(403);
      expect(response.body.error.code).toBe('FORBIDDEN');

      await vi.waitFor(() =>
        expect(forbiddenLogs()).toContainEqual(
          expect.objectContaining({
            code: 'FORBIDDEN',
            userId: broker.id,
            role: 'broker',
            method: 'GET',
            route: path('/probe/platform-admin'),
          }),
        ),
      );
    });

    it('FR-ACC-04 agency_admin passes every broker check; broker does not pass agency_admin', async () => {
      const admin = await createUser({ role: 'agency_admin' });
      const broker = await createUser({ role: 'broker' });
      const adminSession = await sessionFor(admin.email);
      const brokerSession = await sessionFor(broker.email);

      await get('/probe/broker', adminSession).expect(200);
      await get('/probe/agency-admin', adminSession).expect(200);
      await get('/probe/broker', brokerSession).expect(200);
      await get('/probe/agency-admin', brokerSession).expect(403);
    });

    it('FR-ACC-04 staff roles pass only their own checks', async () => {
      const operator = await createUser({ role: 'data_operator' });
      const platformAdmin = await createUser({ role: 'platform_admin' });
      const operatorSession = await sessionFor(operator.email);
      const adminSession = await sessionFor(platformAdmin.email);

      await get('/probe/broker', operatorSession).expect(403);
      await get('/probe/platform-admin', operatorSession).expect(403);
      await get('/probe/platform-admin', adminSession).expect(200);
      await get('/probe/broker', adminSession).expect(403);
    });

    it('FR-ACC-04 an endpoint without @Roles is refused for every role', async () => {
      const platformAdmin = await createUser({ role: 'platform_admin' });
      const session = await sessionFor(platformAdmin.email);
      await get('/probe/undeclared', session).expect(403);
    });

    it('FR-ACC-04 a refused CSRF token is logged with its user', async () => {
      const broker = await createUser({ role: 'broker' });
      const session = await sessionFor(broker.email);
      await request(server()).post(path('/probe/broker-action')).set('Cookie', session).expect(403);

      await vi.waitFor(() =>
        expect(forbiddenLogs()).toContainEqual(
          expect.objectContaining({
            code: 'CSRF_TOKEN_INVALID',
            userId: broker.id,
            role: 'broker',
            method: 'POST',
            route: path('/probe/broker-action'),
          }),
        ),
      );
      expect((await post('/probe/broker-action', { session })).status).toBe(201);
    });

    it('NFR-09 a request without a live session gets 401', async () => {
      await get('/me').expect(401);
      await get('/probe/broker').expect(401);
      await get('/me', `${SESSION_COOKIE}=not-a-real-token`).expect(401);
      await get('/me', `${SESSION_COOKIE}=${'A'.repeat(43)}`).expect(401);
    });
  });

  // ---------------------------------------------------------------- BR-13 and session-ending events

  describe('BR-13 and session-ending events', () => {
    it('BR-13 a suspended agency member cannot log in, and can again once it is reactivated', async () => {
      const agencyId = await createAgency('suspended');
      const member = await createUser({ agencyId });

      const refused = await login(member.email);
      expect(refused.status).toBe(401);
      expect(refused.body.error.code).toBe('INVALID_CREDENTIALS');
      const { rows } = await h.db.query('SELECT 1 FROM sessions WHERE user_id = $1', [member.id]);
      expect(rows).toHaveLength(0);

      // The member's data was kept, so reactivation is all it takes.
      await h.db.query(
        `UPDATE agencies SET status = 'active', status_reason = NULL WHERE id = $1`,
        [agencyId],
      );
      expect((await login(member.email)).status).toBe(200);
    });

    it('FR-ADM-02 BR-13 AgencySuspended ends the sessions of that agency members at once', async () => {
      const agencyId = await createAgency('active');
      const admin = await createUser({ role: 'agency_admin', agencyId });
      const broker = await createUser({ agencyId });
      const outsider = await createUser({ agencyId: h.agencies.other });
      const staff = await createUser({ role: 'platform_admin' });
      const sessions = await Promise.all(
        [admin, broker, outsider, staff].map((user) => sessionFor(user.email)),
      );

      await h.app.get(EventBus).publish(new AgencySuspended(agencyId));

      await get('/me', sessions[0]).expect(401);
      await get('/me', sessions[1]).expect(401);
      await get('/me', sessions[2]).expect(200);
      await get('/me', sessions[3]).expect(200);
    });

    it('FR-AGY-04 MemberDeactivated ends all of that member sessions at once', async () => {
      const member = await createUser();
      const colleague = await createUser();
      const laptop = await sessionFor(member.email);
      const phone = await sessionFor(member.email);
      const colleagueSession = await sessionFor(colleague.email);

      await h.app.get(EventBus).publish(new MemberDeactivated(member.id, h.agencies.active));

      await get('/me', laptop).expect(401);
      await get('/me', phone).expect(401);
      await get('/me', colleagueSession).expect(200);
    });

    it('FR-AGY-04 a deactivated user is refused on the next request even without the event', async () => {
      const user = await createUser();
      const session = await sessionFor(user.email);
      await h.db.query(`UPDATE users SET status = 'deactivated' WHERE id = $1`, [user.id]);
      await get('/me', session).expect(401);
      expect((await sessionRow(session))?.ended_at).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------- NFR-08

  describe('NFR-08 login rate limits and logging', () => {
    const tooMany = (response: request.Response) => response.status === 429;

    it('NFR-08 the per-email limit counts 10 attempts in 15 minutes, from any address, alike for unknown emails', async () => {
      const known = await createUser();
      const run = async (email: string) => {
        const statuses: number[] = [];
        for (let attempt = 0; attempt < 11; attempt += 1) {
          // Changing case and spaces does not escape the count.
          const variant = attempt % 2 === 0 ? email : ` ${email.toUpperCase()} `;
          const response = await login(variant, 'wrong-password-123', {
            ip: `203.0.113.${attempt}`,
          });
          statuses.push(response.status);
        }
        return statuses;
      };

      const forUnknown = await run('nobody-at-all@reih.test');
      const forKnown = await run(known.email);
      expect(forUnknown).toEqual([...Array(10).fill(401), 429]);
      expect(forKnown).toEqual(forUnknown);
    });

    it('NFR-08 the per-address limit counts 50 attempts in 15 minutes', async () => {
      const responses: request.Response[] = [];
      for (let attempt = 0; attempt < 51; attempt += 1) {
        responses.push(
          await login(`someone${attempt}@reih.test`, 'wrong-password-123', { ip: '192.0.2.50' }),
        );
      }
      expect(responses.slice(0, 50).some(tooMany)).toBe(false);
      const last = responses[50] as request.Response;
      expect(last.status).toBe(429);
      expect(Number(last.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(last.headers['retry-after'])).toBeLessThanOrEqual(900);
      // Another address is not affected.
      expect(
        (await login('someone@reih.test', 'wrong-password-123', { ip: '192.0.2.51' })).status,
      ).toBe(401);
    });

    it('NFR-08 a login writes neither the password nor the session or CSRF token to the log', async () => {
      const user = await createUser();
      const secretPassword = 'never-in-the-log-Zq7';
      const { cookie, token } = await csrf();
      await request(server())
        .post(path('/auth/login'))
        .set('Cookie', cookie)
        .set('X-CSRF-Token', token)
        .send({ email: user.email, password: secretPassword })
        .expect(401);
      const response = await request(server())
        .post(path('/auth/login'))
        .set('Cookie', cookie)
        .set('X-CSRF-Token', token)
        .send({ email: user.email, password: PASSWORD })
        .expect(200);
      const sessionToken = tokenOf(cookiePair(response, SESSION_COOKIE) as string);
      await get('/me', `${SESSION_COOKIE}=${sessionToken}`).expect(200);

      // pino-http writes each line when the response finishes, so wait for the last one.
      await vi.waitFor(() =>
        expect(
          logEntries().filter(
            (entry) => (entry.req as { url?: string } | undefined)?.url === path('/me'),
          ).length,
        ).toBeGreaterThan(0),
      );
      const log = h.logLines.join('\n');
      expect(log).toContain(path('/auth/login'));
      expect(log).toContain('[Redacted]');
      for (const secret of [secretPassword, PASSWORD, sessionToken, token]) {
        expect(log).not.toContain(secret);
      }
    });
  });

  // ---------------------------------------------------------------- GET /me and AgencyService

  describe('GET /me', () => {
    it('NFR-09 GET /me returns the caller user, role, agency and preferences, and only theirs', async () => {
      const broker = await createUser({ role: 'broker' });
      const other = await createUser({ role: 'broker', agencyId: h.agencies.other });
      await h.db.query(
        `UPDATE users SET pref_language = 'ar', pref_area_unit = 'sqft', mobile = '+971501234567'
          WHERE id = $1`,
        [broker.id],
      );

      const me = meResponseSchema.parse(
        (await get('/me', await sessionFor(broker.email)).expect(200)).body,
      );
      expect(me).toEqual({
        user: {
          id: broker.id,
          email: broker.email,
          fullName: expect.any(String),
          mobile: '+971501234567',
          whatsapp: null,
          jobTitle: null,
          brn: null,
          photoUrl: null,
        },
        role: 'broker',
        agency: {
          id: h.agencies.active,
          nameAr: `وكالة ${h.agencies.active.slice(0, 8)}`,
          nameEn: `Agency ${h.agencies.active.slice(0, 8)}`,
        },
        preferences: { language: 'ar', currency: 'AED', areaUnit: 'sqft' },
      });

      const theirs = (await get('/me', await sessionFor(other.email)).expect(200)).body;
      expect(theirs.user.id).toBe(other.id);
      expect(theirs.agency.id).toBe(h.agencies.other);
    });

    it('FR-ACC-04 every role can read its own account; staff have no agency', async () => {
      for (const role of ['agency_admin', 'data_operator', 'platform_admin'] as const) {
        const user = await createUser({ role });
        const me = meResponseSchema.parse(
          (await get('/me', await sessionFor(user.email)).expect(200)).body,
        );
        expect(me.role).toBe(role);
        expect(me.agency === null).toBe(role !== 'agency_admin');
      }
    });
  });

  describe('AgencyService', () => {
    it('BR-13 isActive is true only for an active agency that exists', async () => {
      const agencies = h.app.get(AgencyService);
      expect(await agencies.isActive(h.agencies.active)).toBe(true);
      expect(await agencies.isActive(h.agencies.suspended)).toBe(false);
      expect(await agencies.isActive(randomUUID())).toBe(false);
    });

    it('getSummary returns the names, or null for an unknown agency', async () => {
      const agencies = h.app.get(AgencyService);
      expect(await agencies.getSummary(h.agencies.other)).toEqual({
        id: h.agencies.other,
        nameAr: `وكالة ${h.agencies.other.slice(0, 8)}`,
        nameEn: `Agency ${h.agencies.other.slice(0, 8)}`,
      });
      expect(await agencies.getSummary(randomUUID())).toBeNull();
    });
  });
});
