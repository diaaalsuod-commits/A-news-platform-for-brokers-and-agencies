import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  Global,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Module,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { REDIS, RedisModule } from '../queue/index.js';
import { AppError } from './app-error.js';

export interface RateLimitOptions {
  /** Separates this limit's counters from those of other routes. */
  name: string;
  limit: number;
  windowSeconds: number;
  /**
   * What to do when Redis cannot answer. There is no default, so each route decides:
   * 'reject' answers 503, 'allow' lets the request through unlimited.
   */
  whenRedisDown: 'reject' | 'allow';
  /** The caller to count. Defaults to the IP address. */
  key?: (request: Request) => string;
}

const RATE_LIMIT = Symbol('RATE_LIMIT');

// INCR and EXPIRE must run as one step, or a crash between them leaves a counter that never resets.
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return {count, redis.call('TTL', KEYS[1])}
`;

@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Counts one attempt in a fixed window. Rejects when Redis cannot answer. */
  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const [count, ttl] = (await this.redis.eval(
      CONSUME_SCRIPT,
      1,
      `rate-limit:${key}`,
      windowSeconds,
    )) as [number, number];
    return { allowed: count <= limit, retryAfterSeconds: Math.max(ttl, 1) };
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly limiter: RateLimiter,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const limits = this.reflector.get<RateLimitOptions[]>(RATE_LIMIT, context.getHandler());
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();

    // Every limit must allow the request; the first that refuses decides the answer.
    for (const options of limits) {
      const caller = options.key?.(request) ?? request.ip ?? 'unknown';
      let result: Awaited<ReturnType<RateLimiter['consume']>>;
      try {
        result = await this.limiter.consume(
          `${options.name}:${caller}`,
          options.limit,
          options.windowSeconds,
        );
      } catch (error) {
        this.logger.warn(`Rate limit "${options.name}" could not reach Redis: ${String(error)}`);
        if (options.whenRedisDown === 'allow') {
          continue;
        }
        throw new AppError('SERVICE_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE);
      }

      if (!result.allowed) {
        http.getResponse<Response>().setHeader('Retry-After', result.retryAfterSeconds);
        throw new AppError('TOO_MANY_REQUESTS', HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    return true;
  }
}

/** The limits a route handler declares, for tests that check a route's settings. */
export function rateLimitsOf(handler: (...args: never[]) => unknown): RateLimitOptions[] {
  return (Reflect.getMetadata(RATE_LIMIT, handler) as RateLimitOptions[] | undefined) ?? [];
}

/**
 * Limits one route (NFR-08). The numbers come from the route, because the SRS sets none. Pass several
 * limits to count the same request against each, for example per address and per account.
 */
export const RateLimit = (...limits: [RateLimitOptions, ...RateLimitOptions[]]) =>
  applyDecorators(SetMetadata(RATE_LIMIT, limits), UseGuards(RateLimitGuard));

/** Global, because Nest resolves a route's guard from the module of its controller. */
@Global()
@Module({
  imports: [RedisModule],
  providers: [RateLimiter, RateLimitGuard],
  exports: [RateLimiter, RateLimitGuard],
})
export class RateLimitModule {}
