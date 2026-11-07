import { Logger as NestLogger, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { LoggerModule } from 'nestjs-pino';
import { parseEnv, type Env } from './env.js';
import { WorkerService } from './worker.service.js';
import { ENV, REDIS } from './worker.tokens.js';

const envProvider = { provide: ENV, useFactory: () => parseEnv(process.env) };

@Module({
  imports: [
    LoggerModule.forRootAsync({
      providers: [envProvider],
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
        },
      }),
    }),
  ],
  providers: [
    envProvider,
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => {
        // BullMQ workers need maxRetriesPerRequest: null, so the connection is ready for them.
        const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
        // Keep retrying while Redis is away; ping waits for the connection.
        redis.on('error', (error: Error) => new NestLogger('Redis').warn(error.message));
        return redis;
      },
    },
    WorkerService,
  ],
})
export class WorkerModule {}
