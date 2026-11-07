import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from './redis.token.js';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async ping(): Promise<void> {
    await this.redis.ping();
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
