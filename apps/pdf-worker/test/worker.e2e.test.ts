import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WorkerModule } from '../src/worker.module.js';

describe('pdf worker', () => {
  let redis: StartedTestContainer;

  beforeAll(async () => {
    redis = await new GenericContainer('redis:7')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.REDIS_URL = `redis://${redis.getHost()}:${redis.getMappedPort(6379)}`;
  });

  afterAll(async () => {
    await redis?.stop();
  });

  it('logs "worker ready" once Redis answers', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const moduleRef = await Test.createTestingModule({ imports: [WorkerModule] }).compile();
    await moduleRef.init();
    expect(log).toHaveBeenCalledWith('worker ready');
    await moduleRef.close();
  });
});
