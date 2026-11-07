import { Logger, Module } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/index.js';
import { RedisService } from './redis.service.js';
import { REDIS } from './redis.token.js';

@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) => {
        const redis = new Redis(env.REDIS_URL, {
          // Answer "down" at once instead of queueing commands until Redis returns.
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
        });
        // Without a listener, a connection error would be reported as unhandled.
        redis.on('error', (error: Error) => new Logger('Redis').warn(error.message));
        return redis;
      },
    },
    RedisService,
  ],
  exports: [REDIS, RedisService],
})
export class RedisModule {}
