import { Injectable } from '@nestjs/common';
import type { HealthResponse, ServiceState } from '@reih/contracts';
import { DatabaseService } from '../database/index.js';
import { RedisService } from '../queue/index.js';

const PING_TIMEOUT_MS = 2_000;

async function check(ping: () => Promise<void>): Promise<ServiceState> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Ping timed out')), PING_TIMEOUT_MS);
  });
  try {
    await Promise.race([ping(), timeout]);
    return 'up';
  } catch {
    return 'down';
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class HealthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly redisService: RedisService,
  ) {}

  async check(): Promise<HealthResponse> {
    const [db, redis] = await Promise.all([
      check(() => this.database.ping()),
      check(() => this.redisService.ping()),
    ]);
    return { status: db === 'up' && redis === 'up' ? 'ok' : 'degraded', db, redis };
  }
}
