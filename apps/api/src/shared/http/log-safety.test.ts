import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  DATABASE_ERROR_MESSAGE,
  REDACTED,
  redactSensitive,
  safeErrorMessage,
  serializeError,
  withSafeMessage,
} from './log-safety.js';

const PHONE = '+971501234567';
const WHATSAPP = '+971509876543';
const EMAIL = 'sales.manager@developer.example';
const HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHQ$aGFzaGVkLXBhc3N3b3Jk';
const SECRETS = [PHONE, WHATSAPP, EMAIL, HASH];

const QUERY =
  'insert into "sales_contacts" ("developer_id", "phone", "whatsapp", "email") values ($1, $2, $3, $4)';

/** What node-postgres throws: the detail quotes the row, and so can the message. */
function driverError(): Error {
  return Object.assign(new Error(`invalid input value near "${EMAIL}"`), {
    severity: 'ERROR',
    code: '23505',
    detail: `Key (email)=(${EMAIL}) already exists.`,
    constraint: 'users_email_key',
    table: 'users',
  });
}

const queryError = () =>
  new DrizzleQueryError(QUERY, ['a-developer-id', PHONE, WHATSAPP, EMAIL, HASH], driverError());

const expectNoSecret = (logged: unknown) => {
  const text = JSON.stringify(logged);
  for (const secret of SECRETS) {
    expect(text).not.toContain(secret);
  }
};

describe('serializeError', () => {
  it('NFR-08 NFR-11 a failed query is logged as SQL text, code and constraint only', () => {
    const logged = serializeError(queryError()) as Record<string, unknown>;
    expect(Object.keys(logged).sort()).toEqual([
      'code',
      'constraint',
      'message',
      'query',
      'stack',
      'type',
    ]);
    expect(logged).toMatchObject({
      type: 'DatabaseError',
      message: DATABASE_ERROR_MESSAGE,
      query: QUERY,
      code: '23505',
      constraint: 'users_email_key',
    });
    expectNoSecret(logged);
  });

  it('NFR-08 the logged stack keeps its frames and loses the message with the params', () => {
    const { stack } = serializeError(queryError()) as { stack: string };
    expect(stack).toMatch(/^\s+at /);
    expect(stack).not.toContain('params');
    expect(stack).not.toContain('Failed query');
  });

  it('NFR-08 a param with a line that looks like a stack frame is not logged either', () => {
    const error = new DrizzleQueryError(QUERY, [`first line\n    at ${EMAIL}`], driverError());
    expectNoSecret(serializeError(error));
  });

  it("NFR-08 a driver error outside Drizzle loses its detail and message, which quote the row's values", () => {
    const logged = serializeError(driverError()) as Record<string, unknown>;
    expect(logged).toMatchObject({ type: 'DatabaseError', code: '23505' });
    expect(logged).not.toHaveProperty('detail');
    expect(logged).not.toHaveProperty('query');
    expectNoSecret(logged);
  });

  it('NFR-08 a failed query wrapped as the cause of another error is cleaned too', () => {
    const logged = serializeError(new Error('Seeding failed', { cause: queryError() })) as {
      message: string;
      cause: { type: string; code: string };
    };
    expect(logged.message).toBe('Seeding failed');
    expect(logged.cause).toMatchObject({ type: 'DatabaseError', code: '23505' });
    expectNoSecret(logged);
  });

  it('a connection failure keeps the code of its cause', () => {
    const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const logged = serializeError(new DrizzleQueryError('select 1', [], cause));
    expect(logged).toMatchObject({ type: 'DatabaseError', code: 'ECONNREFUSED' });
  });

  it('any other error keeps its type, message, stack and simple properties', () => {
    const error = Object.assign(new RangeError('port out of range'), {
      code: 'ERR_SOCKET_BAD_PORT',
      port: 70_000,
      email: EMAIL,
      rejected: [EMAIL],
    });
    const logged = serializeError(error) as Record<string, unknown>;
    expect(logged).toMatchObject({
      type: 'RangeError',
      message: 'port out of range',
      code: 'ERR_SOCKET_BAD_PORT',
      port: 70_000,
      email: REDACTED,
    });
    expect(logged.stack).toContain('RangeError: port out of range');
    expect(logged).not.toHaveProperty('rejected');
  });

  it('a value that is not an error is logged with its sensitive keys removed', () => {
    expect(serializeError({ reason: 'x', email: EMAIL })).toEqual({ reason: 'x', email: REDACTED });
  });
});

describe('safe log message', () => {
  it('NFR-08 the message of a failed query never quotes its params', () => {
    expect(safeErrorMessage(queryError())).toBe(DATABASE_ERROR_MESSAGE);
    expect(safeErrorMessage(driverError())).toBe(DATABASE_ERROR_MESSAGE);
    expect(safeErrorMessage(new Error('plain'))).toBe('plain');
  });

  it('NFR-08 an error logged without a message gets the safe one', () => {
    const error = queryError();
    expect(withSafeMessage([error])).toEqual([{ err: error }, DATABASE_ERROR_MESSAGE]);
    expect(withSafeMessage([{ context: 'Filter', err: error }])).toEqual([
      { context: 'Filter', err: error },
      DATABASE_ERROR_MESSAGE,
    ]);
  });

  it('a message the caller gave is kept', () => {
    const error = new Error('plain');
    expect(withSafeMessage([{ err: error }, 'Email failed'])).toEqual([
      { err: error },
      'Email failed',
    ]);
    expect(withSafeMessage([{ msg: 'Email failed', err: error }])).toEqual([
      { msg: 'Email failed', err: error },
    ]);
    expect(withSafeMessage(['just text'])).toEqual(['just text']);
  });
});

describe('redactSensitive', () => {
  it('NFR-08 NFR-11 removes phone, WhatsApp, email and passwords at any depth', () => {
    const logged = redactSensitive({
      msg: 'Contact saved',
      phone: PHONE,
      contact: { fullName: 'Sara', whatsapp: WHATSAPP, Email: EMAIL },
      rows: [{ user: { profile: { mobile: PHONE, passwordHash: HASH, password_hash: HASH } } }],
      body: { deep: { deeper: { newPassword: 'a-new-password-1', currentPassword: 'old' } } },
    });
    expect(logged).toEqual({
      msg: 'Contact saved',
      phone: REDACTED,
      contact: { fullName: 'Sara', whatsapp: REDACTED, Email: REDACTED },
      rows: [
        {
          user: { profile: { mobile: REDACTED, passwordHash: REDACTED, password_hash: REDACTED } },
        },
      ],
      body: { deep: { deeper: { newPassword: REDACTED, currentPassword: REDACTED } } },
    });
    expectNoSecret(logged);
  });

  it('copies: the logged object itself is not changed', () => {
    const original = { contact: { phone: PHONE } };
    redactSensitive(original);
    expect(original.contact.phone).toBe(PHONE);
  });

  it('leaves class instances to their serializers, and other values as they are', () => {
    const date = new Date(0);
    const error = new Error('x');
    const logged = redactSensitive({ at: date, err: error, count: 3, none: null });
    expect(logged.at).toBe(date);
    expect(logged.err).toBe(error);
    expect(logged).toMatchObject({ count: 3, none: null });
  });

  it('survives a cycle and cuts what is nested too deep to check', () => {
    const cyclic: Record<string, unknown> = { name: 'loop' };
    cyclic.self = cyclic;
    expect(redactSensitive(cyclic)).toEqual({ name: 'loop', self: '[Circular]' });

    let deep: Record<string, unknown> = { email: EMAIL };
    for (let level = 0; level < 12; level += 1) deep = { next: deep };
    expectNoSecret(redactSensitive(deep));
    expect(JSON.stringify(redactSensitive(deep))).toContain('[Truncated]');
  });
});
