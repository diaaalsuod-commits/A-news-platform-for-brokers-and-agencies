import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import type { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import type { UserRole, UserStatus } from '@reih/contracts';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Redis } from 'ioredis';
import { Logger } from 'nestjs-pino';
import pg from 'pg';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, beforeEach, expect, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { API_PREFIX, configureApp } from '../../src/app.setup.js';
import { LOG_DESTINATION } from '../../src/shared/http/index.js';

const MIGRATIONS = join(import.meta.dirname, '../../drizzle');
export const PASSWORD = 'correct-horse-battery-1';
export const SESSION_COOKIE = 'reih_session';
export const CSRF_COOKIE = '__Host-reih_csrf';

export interface MailMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
  Text: string;
  HTML: string;
}

/**
 * The whole API on Testcontainers (PostGIS, Redis and, when asked, Mailpit), with helpers for the
 * identity tests. Call it inside describe(): it registers that block's hooks. Modules passed in
 * are added to the test application only, never to AppModule.
 */
export function useIdentityApp(options: { modules?: Type[]; mailpit?: boolean } = {}) {
  let postgres: StartedPostgreSqlContainer;
  let redisContainer: StartedTestContainer;
  let mailpit: StartedTestContainer | undefined;
  let redis: Redis;
  let db: pg.Pool;
  let app: INestApplication;
  let passwordHash: string;
  let mailApi = '';
  let filesDir = '';
  const agencies = { active: '', other: '', suspended: '' };
  let counter = 0;

  /** Every JSON line the application logs, so a test can read them back. */
  const logLines: string[] = [];
  const logCapture = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      logLines.push(...chunk.toString().split('\n').filter(Boolean));
      callback();
    },
  });

  beforeAll(async () => {
    [postgres, redisContainer, mailpit, passwordHash] = await Promise.all([
      new PostgreSqlContainer('postgis/postgis:16-3.4').start(),
      new GenericContainer('redis:7')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
        .start(),
      options.mailpit
        ? new GenericContainer('axllent/mailpit:v1.27')
            .withExposedPorts(1025, 8025)
            .withWaitStrategy(Wait.forListeningPorts())
            .start()
        : Promise.resolve(undefined),
      hash(PASSWORD),
    ]);
    const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;
    db = new pg.Pool({ connectionString: postgres.getConnectionUri() });
    await migrate(drizzle({ client: db }), { migrationsFolder: MIGRATIONS });
    redis = new Redis(redisUrl);
    filesDir = mkdtempSync(join(tmpdir(), 'reih-files-'));

    // Nodemailer looks a name up in DNS and not in the hosts file, so "localhost" can hang.
    const mailHost = mailpit && mailpit.getHost() !== 'localhost' ? mailpit.getHost() : '127.0.0.1';
    if (mailpit) {
      mailApi = `http://${mailHost}:${mailpit.getMappedPort(8025)}/api/v1`;
    }
    Object.assign(process.env, {
      NODE_ENV: 'test',
      API_PORT: '4000',
      LOG_LEVEL: 'info',
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: redisUrl,
      SMTP_HOST: mailHost,
      SMTP_PORT: mailpit ? String(mailpit.getMappedPort(1025)) : '1025',
      SMTP_FROM: 'REIH <no-reply@example.test>',
      FILES_DIR: filesDir,
      URL_SIGNING_SECRET: 'a-test-secret-of-at-least-32-characters',
      APP_URL: 'https://app.localhost',
      OPS_URL: 'https://ops.localhost',
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ...(options.modules ?? [])],
    })
      .overrideProvider(LOG_DESTINATION)
      .useValue(logCapture)
      .compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    configureApp(app);
    await app.init();

    agencies.active = await createAgency('active');
    agencies.other = await createAgency('active');
    agencies.suspended = await createAgency('suspended');
  });

  afterAll(async () => {
    await app?.close();
    redis?.disconnect();
    await db?.end();
    await Promise.all([postgres?.stop(), redisContainer?.stop(), mailpit?.stop()]);
    if (filesDir) rmSync(filesDir, { recursive: true, force: true });
  });

  // Rate-limit counters would otherwise carry over from one test to the next.
  beforeEach(async () => {
    await redis.flushall();
  });

  // ---------------------------------------------------------------- fixtures

  async function createAgency(status: 'active' | 'suspended'): Promise<string> {
    const id = randomUUID();
    await db.query(
      `INSERT INTO agencies (id, name_ar, name_en, trade_license_no, contact_email, contact_phone,
         status, status_reason)
       VALUES ($1, $2, $3, $4, $5, '+971500000000', $6, $7)`,
      [
        id,
        `وكالة ${id.slice(0, 8)}`,
        `Agency ${id.slice(0, 8)}`,
        `TL-${id}`,
        `office-${id.slice(0, 8)}@agency.test`,
        status,
        status === 'suspended' ? 'Test suspension' : null,
      ],
    );
    return id;
  }

  async function createUser(
    user: {
      role?: UserRole;
      status?: UserStatus;
      agencyId?: string | null;
      withPassword?: boolean;
      language?: 'ar' | 'en';
    } = {},
  ): Promise<{ id: string; email: string }> {
    const role = user.role ?? 'broker';
    const isAgencyRole = role === 'broker' || role === 'agency_admin';
    const agencyId =
      user.agencyId !== undefined ? user.agencyId : isAgencyRole ? agencies.active : null;
    counter += 1;
    const email = `user${counter}-${randomUUID().slice(0, 6)}@reih.test`;
    const id = randomUUID();
    await db.query(
      `INSERT INTO users (id, agency_id, email, password_hash, role, status, full_name,
         pref_language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        agencyId,
        email,
        user.withPassword === false ? null : passwordHash,
        role,
        user.status ?? 'active',
        `Test User ${counter}`,
        user.language ?? 'en',
      ],
    );
    return { id, email };
  }

  // ---------------------------------------------------------------- HTTP helpers

  const server = () => app.getHttpServer();
  const path = (p: string) => `/${API_PREFIX}${p}`;

  /** The whole Set-Cookie line of a cookie the response set, or undefined. */
  function setCookie(response: request.Response, name: string): string | undefined {
    const header = response.headers['set-cookie'] as unknown as string[] | undefined;
    return header?.find((cookie) => cookie.startsWith(`${name}=`));
  }
  /** "name=value" of a cookie the response set, or undefined. */
  function cookiePair(response: request.Response, name: string): string | undefined {
    return setCookie(response, name)?.split(';')[0];
  }
  const tokenOf = (pair: string) => pair.slice(pair.indexOf('=') + 1);

  async function csrf(): Promise<{ cookie: string; token: string }> {
    const response = await request(server()).get(path('/auth/csrf')).expect(200);
    return { cookie: cookiePair(response, CSRF_COOKIE) as string, token: response.body.token };
  }

  /**
   * A state-changing request with a valid CSRF token, and the given session if any. It resolves to
   * the response: a supertest request is thenable, so returning one unsent from here would send it.
   */
  async function send(
    method: 'post' | 'put' | 'patch' | 'delete',
    p: string,
    sendOptions: {
      session?: string;
      ip?: string;
      language?: string;
      body?: object;
      attach?: { field: string; content: Buffer; filename: string };
    } = {},
  ): Promise<request.Response> {
    const { cookie, token } = await csrf();
    const agent = request(server());
    const test = agent[method](path(p))
      .set('Cookie', [cookie, sendOptions.session].filter(Boolean).join('; '))
      .set('X-CSRF-Token', token)
      .set('X-Forwarded-For', sendOptions.ip ?? '198.51.100.1');
    if (sendOptions.language) {
      test.set('Accept-Language', sendOptions.language);
    }
    if (sendOptions.attach) {
      const { field, content, filename } = sendOptions.attach;
      return test.attach(field, content, filename);
    }
    return test.send(sendOptions.body ?? {});
  }

  const post = (p: string, sendOptions: Parameters<typeof send>[2] = {}) =>
    send('post', p, sendOptions);

  function login(
    email: string,
    password = PASSWORD,
    loginOptions: { session?: string; ip?: string; language?: string } = {},
  ): Promise<request.Response> {
    return post('/auth/login', { ...loginOptions, body: { email, password } });
  }

  /** Logs in and returns the "reih_session=..." pair. */
  async function sessionFor(email: string, password = PASSWORD): Promise<string> {
    const response = await login(email, password);
    expect(response.status).toBe(200);
    return cookiePair(response, SESSION_COOKIE) as string;
  }

  const get = (p: string, session?: string) => {
    const test = request(server()).get(path(p));
    return session ? test.set('Cookie', session) : test;
  };

  const sessionRow = async (session: string) =>
    (
      await db.query<{ ended_at: Date | null; last_activity_at: Date; expires_at: Date }>(
        'SELECT ended_at, last_activity_at, expires_at FROM sessions WHERE token_hash = $1',
        [createHash('sha256').update(tokenOf(session)).digest('hex')],
      )
    ).rows[0];

  const logEntries = () => logLines.map((line) => JSON.parse(line) as Record<string, unknown>);

  // ---------------------------------------------------------------- Mailpit

  /** The latest email to this address, waiting a few seconds for it to arrive. */
  async function mailTo(address: string): Promise<MailMessage> {
    let id: string | undefined;
    await vi.waitFor(
      async () => {
        const query = encodeURIComponent(`to:"${address}"`);
        const found = (await (await fetch(`${mailApi}/search?query=${query}`)).json()) as {
          messages: { ID: string }[];
        };
        id = found.messages[0]?.ID;
        expect(id).toBeDefined();
      },
      { timeout: 10_000, interval: 100 },
    );
    return (await (await fetch(`${mailApi}/message/${id}`)).json()) as MailMessage;
  }

  async function mailCount(address: string): Promise<number> {
    const query = encodeURIComponent(`to:"${address}"`);
    const found = (await (await fetch(`${mailApi}/search?query=${query}`)).json()) as {
      messages_count: number;
    };
    return found.messages_count;
  }

  /** The token after #token= in an emailed link. */
  function linkToken(message: MailMessage): string {
    const match = /#token=([A-Za-z0-9_-]{43})/.exec(message.Text);
    expect(match, 'the email carries a link with a token').not.toBeNull();
    return (match as RegExpExecArray)[1] as string;
  }

  return {
    get app() {
      return app;
    },
    get db() {
      return db;
    },
    get redis() {
      return redis;
    },
    get filesDir() {
      return filesDir;
    },
    agencies,
    logLines,
    logEntries,
    createAgency,
    createUser,
    server,
    path,
    setCookie,
    cookiePair,
    tokenOf,
    csrf,
    send,
    post,
    login,
    sessionFor,
    get,
    sessionRow,
    mailTo,
    mailCount,
    linkToken,
  };
}
