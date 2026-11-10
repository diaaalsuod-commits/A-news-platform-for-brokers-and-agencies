import { randomUUID } from 'node:crypto';
import { Controller, Get, Module } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Roles } from '../src/shared/http/index.js';
import { MAIL_TRANSPORT } from '../src/shared/mail/index.js';
import { useIdentityApp } from './support/identity-app.js';

/** A test-only route that fails unexpectedly, so the exception filter logs it. */
@Controller('probe')
class CrashController {
  @Roles('data_operator')
  @Get('crash')
  crash(): void {
    throw new Error('Unexpected failure');
  }
}

@Module({ controllers: [CrashController] })
class CrashModule {}

/** An SMTP server that refuses every recipient, quoting the address as real servers do. */
const refusingTransport = {
  sendMail: ({ to }: { to: string }) =>
    Promise.reject(
      Object.assign(
        new Error(`Can't send mail - all recipients were rejected: 550 5.1.1 <${to}>: unknown`),
        { code: 'EENVELOPE', responseCode: 550, response: `550 5.1.1 <${to}>`, rejected: [to] },
      ),
    ),
  close: () => undefined,
};

interface LogEntry {
  msg?: string;
  req?: { url?: string; query?: Record<string, unknown> };
  err?: Record<string, unknown>;
  route?: string;
}

describe('free text stays out of the request and mail logs (NFR-08, NFR-11)', () => {
  const h = useIdentityApp({
    modules: [CrashModule],
    overrides: [{ provide: MAIL_TRANSPORT, useValue: refusingTransport }],
  });
  const sessions = { operator: '', broker: '', admin: '' };

  beforeAll(async () => {
    sessions.operator = await h.sessionFor((await h.createUser({ role: 'data_operator' })).email);
    sessions.broker = await h.sessionFor((await h.createUser({ role: 'broker' })).email);
    sessions.admin = await h.sessionFor((await h.createUser({ role: 'platform_admin' })).email);
  });

  const entries = () => h.logEntries() as LogEntry[];
  const searched = () => `searched.${randomUUID().slice(0, 8)}@example.com`;
  const logText = () => h.logLines.join('\n');

  /** pino-http writes the request line when the response finishes. */
  const requestLine = async (path: string) => {
    await vi.waitFor(() =>
      expect(entries().some((entry) => entry.req?.url?.startsWith(h.path(path)))).toBe(true),
    );
    return entries().filter((entry) => entry.req?.url?.startsWith(h.path(path)));
  };

  it('NFR-08 NFR-11 a GET with ?q=<email> leaves no email in the log but still shows the path', async () => {
    const email = searched();
    const response = await h.get(
      `/content/developers?q=${encodeURIComponent(email)}&status=active&page=1`,
      sessions.operator,
    );
    expect(response.status).toBe(200);

    const lines = await requestLine('/content/developers?');
    expect(lines.map((entry) => entry.req?.url)).toContainEqual(
      h.path('/content/developers?q=[Redacted]&status=active&page=1'),
    );
    expect(lines[0]?.req?.query).toMatchObject({ q: '[Redacted]', status: 'active', page: '1' });
    expect(logText()).not.toContain(email);
    expect(logText()).not.toContain(encodeURIComponent(email));
  });

  it('NFR-08 a refused search (403) logs the route and no email', async () => {
    const email = searched();
    const response = await h.get(`/admin/staff?q=${encodeURIComponent(email)}`, sessions.broker);
    expect(response.status).toBe(403);

    await vi.waitFor(() =>
      expect(entries()).toContainEqual(
        expect.objectContaining({ msg: 'Request forbidden', route: h.path('/admin/staff') }),
      ),
    );
    await requestLine('/admin/staff?');
    expect(logText()).toContain(h.path('/admin/staff?q=[Redacted]'));
    expect(logText()).not.toContain(email);
    expect(logText()).not.toContain(encodeURIComponent(email));
  });

  it('NFR-08 an unexpected error logged by the exception filter shows the path, not the search', async () => {
    const email = searched();
    const response = await h.get(`/probe/crash?q=${encodeURIComponent(email)}`, sessions.operator);
    expect(response.status).toBe(500);

    await vi.waitFor(() =>
      expect(
        entries().some(
          (entry) =>
            entry.msg === 'Unexpected failure' &&
            entry.req?.url === h.path('/probe/crash?q=[Redacted]'),
        ),
      ).toBe(true),
    );
    expect(logText()).not.toContain(email);
  });

  it('NFR-08 NFR-11 a password reset email that fails leaves no address in the log', async () => {
    const user = await h.createUser({ role: 'broker' });
    expect((await h.post('/auth/forgot', { body: { email: user.email } })).status).toBe(202);

    await vi.waitFor(() =>
      expect(entries()).toContainEqual(
        expect.objectContaining({
          msg: 'Password reset email failed',
          err: expect.objectContaining({
            type: 'MailDeliveryError',
            errorName: 'Error',
            code: 'EENVELOPE',
            responseCode: 550,
          }),
        }),
      ),
    );
    expect(logText()).not.toContain(user.email);
  });

  it('NFR-08 NFR-11 an invitation email that fails leaves no address in the log', async () => {
    const invitee = `invitee.${randomUUID().slice(0, 8)}@example.com`;
    const response = await h.post('/admin/staff/invitations', {
      session: sessions.admin,
      body: { email: invitee, role: 'data_operator' },
    });
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');

    await vi.waitFor(() =>
      expect(entries()).toContainEqual(
        expect.objectContaining({
          err: expect.objectContaining({ type: 'MailDeliveryError', code: 'EENVELOPE' }),
        }),
      ),
    );
    expect(logText()).not.toContain(invitee);
  });
});
