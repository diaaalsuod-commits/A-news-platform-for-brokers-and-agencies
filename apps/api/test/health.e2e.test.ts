import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { healthResponseSchema } from '@reih/contracts';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import request from 'supertest';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { API_PREFIX, configureApp } from '../src/app.setup.js';

describe('GET /api/v1/health', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedTestContainer;
  let app: INestApplication;

  beforeAll(async () => {
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer('postgis/postgis:16-3.4').start(),
      new GenericContainer('redis:7')
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
        .start(),
    ]);

    process.env.NODE_ENV = 'test';
    process.env.API_PORT = '4000';
    process.env.LOG_LEVEL = 'silent';
    process.env.DATABASE_URL = postgres.getConnectionUri();
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
    process.env.SMTP_HOST = 'localhost';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_FROM = 'REIH <no-reply@example.test>';
    process.env.FILES_DIR = './files';
    process.env.URL_SIGNING_SECRET = 'a-test-secret-of-at-least-32-characters';
    process.env.APP_URL = 'https://app.localhost';
    process.env.OPS_URL = 'https://ops.localhost';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    // Redis commands are refused until the first connection is open.
    await vi.waitFor(async () => expect((await get()).status).toBe(200), { timeout: 10_000 });
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([postgres?.stop(), redis?.stop()]);
  });

  const get = () => request(app.getHttpServer()).get(`/${API_PREFIX}/health`);

  it('is served under the /api/v1 prefix', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('answers without a login and reports both services up', async () => {
    const response = await get().expect(200);
    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: 'ok',
      db: 'up',
      redis: 'up',
    });
  });

  it('creates a request id when the caller sends none', async () => {
    const response = await get();
    expect(response.headers['x-request-id']).toMatch(/^[\w-]{8,128}$/);
  });

  it('returns a well-formed request id sent by the caller', async () => {
    const response = await get().set('x-request-id', 'caller-request-1');
    expect(response.headers['x-request-id']).toBe('caller-request-1');
  });

  it('replaces a malformed request id', async () => {
    const response = await get().set('x-request-id', 'bad id!');
    expect(response.headers['x-request-id']).not.toBe('bad id!');
  });

  // Runs last: it stops the Redis container.
  it('answers 503 with the same body when Redis is down', async () => {
    await redis.stop();
    await expect.poll(async () => (await get()).status, { timeout: 10_000 }).toBe(503);
    const response = await get();
    expect(healthResponseSchema.parse(response.body)).toEqual({
      status: 'degraded',
      db: 'up',
      redis: 'down',
    });
  });
});
