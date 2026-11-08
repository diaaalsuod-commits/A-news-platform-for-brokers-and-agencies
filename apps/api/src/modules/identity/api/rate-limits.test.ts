import { describe, expect, it } from 'vitest';
import { rateLimitsOf } from '../../../shared/http/index.js';
import { IDENTITY_RATE_LIMITS } from '../domain/rate-limits.js';
import { AuthController } from './auth.controller.js';
import { MeController } from './me.controller.js';

const limits = (handler: (...args: never[]) => unknown) =>
  rateLimitsOf(handler).map(({ name, limit, windowSeconds, whenRedisDown }) => ({
    name,
    limit,
    windowSeconds,
    whenRedisDown,
  }));

describe('identity rate limits', () => {
  it('NFR-08 forgot and reset count per address and per email or token, and answer 503 without Redis', () => {
    expect(limits(AuthController.prototype.forgot)).toEqual([
      { name: 'forgot-ip', limit: 10, windowSeconds: 900, whenRedisDown: 'reject' },
      { name: 'forgot-email', limit: 3, windowSeconds: 3600, whenRedisDown: 'reject' },
    ]);
    expect(limits(AuthController.prototype.reset)).toEqual([
      { name: 'reset-ip', limit: 20, windowSeconds: 900, whenRedisDown: 'reject' },
      { name: 'reset-token', limit: 5, windowSeconds: 900, whenRedisDown: 'reject' },
    ]);
  });

  it('NFR-08 invitation links and password change are limited and answer 503 without Redis', () => {
    for (const handler of [
      AuthController.prototype.checkInvitation,
      AuthController.prototype.activate,
    ]) {
      expect(limits(handler)).toEqual([
        { name: 'invitation-ip', limit: 20, windowSeconds: 900, whenRedisDown: 'reject' },
        { name: 'invitation-token', limit: 10, windowSeconds: 900, whenRedisDown: 'reject' },
      ]);
    }
    expect(limits(MeController.prototype.changePassword)).toEqual([
      { name: 'password-change', limit: 5, windowSeconds: 900, whenRedisDown: 'reject' },
    ]);
  });

  it('NFR-08 login keeps working without Redis, because the account lockout still protects it', () => {
    expect(limits(AuthController.prototype.login).map((l) => l.whenRedisDown)).toEqual([
      'allow',
      'allow',
    ]);
    expect(IDENTITY_RATE_LIMITS.login.perIp.limit).toBe(50);
  });
});
