import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from './worker.tokens.js';

@Injectable()
export class WorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.redis.ping();
    this.logger.log('worker ready');
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}
