import { Writable } from 'node:stream';
import type { Transporter } from 'nodemailer';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { parseEnv } from '../config/index.js';
import { buildPinoHttpOptions } from '../http/index.js';
import { serializeError } from '../http/log-safety.js';
import { MailDeliveryError } from './mail-delivery-error.js';
import { MailService } from './mail.service.js';

const RECIPIENT = 'invitee.person@agency.example';

const env = parseEnv({
  NODE_ENV: 'test',
  API_PORT: '4000',
  LOG_LEVEL: 'info',
  DATABASE_URL: 'postgres://user:password@localhost:5432/unused',
  REDIS_URL: 'redis://localhost:6379',
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: '1025',
  SMTP_FROM: 'REIH <no-reply@example.test>',
  FILES_DIR: './files',
  URL_SIGNING_SECRET: 'a-test-secret-of-at-least-32-characters',
  APP_URL: 'https://app.localhost',
  OPS_URL: 'https://ops.localhost',
});

/** What nodemailer throws when the server refuses the recipient: every text quotes the address. */
function rejectedRecipient(to: string): Error {
  return Object.assign(
    new Error(
      `Can't send mail - all recipients were rejected: 550 5.1.1 <${to}>: Recipient unknown`,
    ),
    {
      code: 'EENVELOPE',
      responseCode: 550,
      response: `550 5.1.1 <${to}>: Recipient unknown`,
      command: 'RCPT TO',
      rejected: [to],
      rejectedErrors: [new Error(`Recipient ${to} rejected`)],
    },
  );
}

const failingTransport = (failure: (to: string) => unknown) =>
  ({
    sendMail: ({ to }: { to: string }) => Promise.reject(failure(to)),
    close: () => undefined,
  }) as unknown as Transporter;

const send = (service: MailService) =>
  service.send(RECIPIENT, 'passwordReset', 'en', {
    actionUrl: 'https://app.localhost/en/reset-password#token=x',
    validMinutes: 60,
  });

describe('MailService failures (NFR-08, NFR-11)', () => {
  it('NFR-08 a failed send keeps the error name, code and SMTP response code, and nothing else', async () => {
    const service = new MailService(failingTransport(rejectedRecipient), env);
    const error = await send(service).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(MailDeliveryError);
    expect(error).toMatchObject({
      name: 'MailDeliveryError',
      message: 'Mail delivery failed',
      errorName: 'Error',
      code: 'EENVELOPE',
      responseCode: 550,
    });
    expect((error as Error).cause).toBeUndefined();
    expect(JSON.stringify(serializeError(error))).not.toContain(RECIPIENT);
    expect(String((error as Error).stack)).not.toContain(RECIPIENT);
  });

  it('NFR-08 NFR-11 the log of a failed send whose message quotes the recipient has no address', async () => {
    const lines: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        lines.push(...chunk.toString().split('\n').filter(Boolean));
        callback();
      },
    });
    const {
      genReqId: _genReqId,
      wrapSerializers: _wrapSerializers,
      ...options
    } = buildPinoHttpOptions(env);
    const logger = pino(options, destination);

    const error = await send(new MailService(failingTransport(rejectedRecipient), env)).catch(
      (caught: unknown) => caught,
    );
    // As the password reset logs it, and as the exception filter logs an invitation that failed.
    logger.error({ msg: 'Password reset email failed', err: error });
    logger.error(error);

    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).not.toContain(RECIPIENT);
    expect(lines.join('\n')).not.toContain('Recipient unknown');
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      msg: 'Password reset email failed',
      err: { type: 'MailDeliveryError', errorName: 'Error', code: 'EENVELOPE', responseCode: 550 },
    });
  });

  it('keeps only well-formed values: an odd code or response code is left out', async () => {
    const odd = () =>
      Object.assign(new TypeError('boom'), { code: `bad <${RECIPIENT}>`, responseCode: '550' });
    const error = (await send(new MailService(failingTransport(odd), env)).catch(
      (caught: unknown) => caught,
    )) as MailDeliveryError;
    expect(error.errorName).toBe('TypeError');
    expect(error.code).toBeUndefined();
    expect(error.responseCode).toBeUndefined();

    const notAnError = (await send(
      new MailService(
        failingTransport(() => RECIPIENT),
        env,
      ),
    ).catch((caught: unknown) => caught)) as MailDeliveryError;
    expect(notAnError).toBeInstanceOf(MailDeliveryError);
    expect(JSON.stringify(serializeError(notAnError))).not.toContain(RECIPIENT);
  });

  it('a send that works resolves as before', async () => {
    const sent: unknown[] = [];
    const transport = {
      sendMail: (mail: unknown) => {
        sent.push(mail);
        return Promise.resolve();
      },
      close: () => undefined,
    } as unknown as Transporter;
    await send(new MailService(transport, env));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: RECIPIENT, from: env.SMTP_FROM });
  });
});
