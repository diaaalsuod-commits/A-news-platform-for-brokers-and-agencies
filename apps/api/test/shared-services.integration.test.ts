import { randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { catalogPdfQueueName } from '@reih/contracts';
import { messages } from '@reih/i18n';
import { Worker } from 'bullmq';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApp } from '../src/app.setup.js';
import { ConfigModule } from '../src/shared/config/index.js';
import { HttpExceptionFilter, RateLimit, RateLimitModule } from '../src/shared/http/index.js';
import { MailModule, MailService } from '../src/shared/mail/index.js';
import { CatalogPdfQueue, catalogPdfJobOptions } from '../src/shared/queue/index.js';

function setEnvironment(overrides: Record<string, string>): void {
  Object.assign(process.env, {
    NODE_ENV: 'test',
    API_PORT: '4000',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgres://user:password@localhost:5432/unused',
    REDIS_URL: 'redis://localhost:6379',
    SMTP_HOST: 'localhost',
    SMTP_PORT: '1025',
    SMTP_FROM: 'REIH <no-reply@example.test>',
    FILES_DIR: './files',
    URL_SIGNING_SECRET: 'a-test-secret-of-at-least-32-characters',
    APP_URL: 'https://app.localhost',
    OPS_URL: 'https://ops.localhost',
    ...overrides,
  });
}

describe('catalog-pdf queue', () => {
  let redis: StartedTestContainer;
  let redisUrl: string;

  beforeAll(async () => {
    redis = await new GenericContainer('redis:7')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();
    redisUrl = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  });

  afterAll(() => redis?.stop());

  it('SRS 3.2 a failing job runs once, is retried twice, then is marked failed', async () => {
    expect(catalogPdfJobOptions.attempts).toBe(3);
    const queue = new CatalogPdfQueue(redisUrl);
    const catalogVersionId = randomUUID();
    let runs = 0;

    const worker = new Worker(
      catalogPdfQueueName,
      async () => {
        runs += 1;
        throw new Error('rendering failed');
      },
      { connection: { url: redisUrl, maxRetriesPerRequest: null } },
    );
    const finalFailure = new Promise<{ attemptsMade: number; data: unknown }>((resolve) => {
      worker.on('failed', (job) => {
        if (job && job.attemptsMade >= catalogPdfJobOptions.attempts) {
          resolve({ attemptsMade: job.attemptsMade, data: job.data });
        }
      });
    });

    try {
      await queue.add({ catalogVersionId });
      await expect(finalFailure).resolves.toEqual({
        attemptsMade: 3,
        data: { catalogVersionId },
      });
      expect(runs).toBe(3);
    } finally {
      await worker.close();
      await queue.onModuleDestroy();
    }
  });

  it('refuses a job that does not match the shared contract', async () => {
    const queue = new CatalogPdfQueue(redisUrl);
    try {
      await expect(queue.add({ catalogVersionId: 'not-a-uuid' })).rejects.toThrow();
    } finally {
      await queue.onModuleDestroy();
    }
  });
});

@Controller()
class LimitedController {
  @RateLimit({ name: 'reveal', limit: 2, windowSeconds: 60, whenRedisDown: 'reject' })
  @Get('reveal')
  reveal() {
    return { ok: true };
  }

  @RateLimit({ name: 'login', limit: 2, windowSeconds: 60, whenRedisDown: 'allow' })
  @Get('login')
  login() {
    return { ok: true };
  }

  @RateLimit({ name: 'short', limit: 1, windowSeconds: 1, whenRedisDown: 'reject' })
  @Get('short')
  short() {
    return { ok: true };
  }

  @RateLimit({
    name: 'by-header',
    limit: 1,
    windowSeconds: 60,
    whenRedisDown: 'reject',
    key: (req) => String(req.headers['x-user']),
  })
  @Get('by-key')
  byKey() {
    return { ok: true };
  }
}

@Module({
  imports: [ConfigModule, RateLimitModule],
  controllers: [LimitedController],
  providers: [{ provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
class LimitedModule {}

describe('@RateLimit', () => {
  let redis: StartedTestContainer;
  let app: INestApplication;

  beforeAll(async () => {
    redis = await new GenericContainer('redis:7')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();
    setEnvironment({ REDIS_URL: `redis://${redis.getHost()}:${redis.getMappedPort(6379)}` });

    const moduleRef = await Test.createTestingModule({ imports: [LimitedModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    // Redis commands are refused until the first connection is open.
    await vi.waitFor(
      async () => expect((await call('/by-key').set('x-user', 'warm-up')).status).toBe(200),
      { timeout: 10_000 },
    );
  });

  afterAll(async () => {
    await app?.close();
    await redis?.stop();
  });

  // Caddy is the one proxy in front of the API, so X-Forwarded-For names the caller.
  const call = (path: string, ip = '203.0.113.1') =>
    request(app.getHttpServer()).get(`/api/v1${path}`).set('X-Forwarded-For', ip);

  it('NFR-08 allows up to the limit, then answers 429 with Retry-After in the caller language', async () => {
    await call('/reveal').expect(200);
    await call('/reveal').expect(200);

    const refused = await call('/reveal').set('Accept-Language', 'ar').expect(429);
    expect(refused.body.error).toEqual({
      code: 'TOO_MANY_REQUESTS',
      message: messages.ar.errors.TOO_MANY_REQUESTS,
      details: {},
    });
    const retryAfter = Number(refused.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(60);
  });

  it('counts each caller separately, by the address Caddy reports', async () => {
    await call('/login', '203.0.113.10').expect(200);
    await call('/login', '203.0.113.10').expect(200);
    await call('/login', '203.0.113.10').expect(429);
    await call('/login', '203.0.113.11').expect(200);
  });

  it('counts each route separately', async () => {
    const ip = '203.0.113.20';
    await call('/reveal', ip).expect(200);
    await call('/reveal', ip).expect(200);
    await call('/reveal', ip).expect(429);
    await call('/login', ip).expect(200);
  });

  it('can count by a key the route chooses, whatever the address', async () => {
    await call('/by-key', '203.0.113.30').set('x-user', 'user-1').expect(200);
    await call('/by-key', '203.0.113.31').set('x-user', 'user-1').expect(429);
    await call('/by-key', '203.0.113.31').set('x-user', 'user-2').expect(200);
  });

  it('allows the caller again after the window ends', async () => {
    const ip = '203.0.113.40';
    await call('/short', ip).expect(200);
    await call('/short', ip).expect(429);
    await expect
      .poll(async () => (await call('/short', ip)).status, { timeout: 5_000, interval: 250 })
      .toBe(200);
  });

  // Runs last: it stops the Redis container.
  it('NFR-08 with Redis down, a "reject" route answers 503 and an "allow" route still works', async () => {
    await redis.stop();
    await expect
      .poll(async () => (await call('/reveal', '203.0.113.50')).status, { timeout: 10_000 })
      .toBe(503);

    const rejected = await call('/reveal', '203.0.113.50').expect(503);
    expect(rejected.body.error.code).toBe('SERVICE_UNAVAILABLE');

    // Past the limit of 2 as well: nothing is counted while Redis is down.
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await call('/login', '203.0.113.50').expect(200);
    }
  });
});

describe('MailService', () => {
  let mailpit: StartedTestContainer;
  let mailApi: string;
  let app: INestApplication;

  beforeAll(async () => {
    mailpit = await new GenericContainer('axllent/mailpit:v1.27')
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();
    mailApi = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}/api/v1`;
    setEnvironment({
      // Nodemailer looks a name up in DNS and not in the hosts file, so "localhost" can hang.
      SMTP_HOST: mailpit.getHost() === 'localhost' ? '127.0.0.1' : mailpit.getHost(),
      SMTP_PORT: String(mailpit.getMappedPort(1025)),
    });

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, MailModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await mailpit?.stop();
  });

  it('D-03 delivers an Arabic invitation over SMTP', async () => {
    const link = 'https://app.localhost/activate?token=abc';
    await app.get(MailService).send('new.broker@example.test', 'invitation', 'ar', {
      actionUrl: link,
      validDays: 7,
    });

    const { messages: inbox } = (await (await fetch(`${mailApi}/messages`)).json()) as {
      messages: { ID: string; Subject: string; To: { Address: string }[] }[];
    };
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.Subject).toBe(messages.ar.email.invitation.subject);
    expect(inbox[0]?.To[0]?.Address).toBe('new.broker@example.test');

    const message = (await (await fetch(`${mailApi}/message/${inbox[0]?.ID}`)).json()) as {
      HTML: string;
      Text: string;
      From: { Address: string };
    };
    expect(message.From.Address).toBe('no-reply@example.test');
    expect(message.HTML).toContain('dir="rtl"');
    expect(message.Text).toContain(link);
  });
});
