import { describe, expect, it } from 'vitest';
import { afterFailedLogin, isLocked, LOCKOUT_MINUTES, MAX_FAILED_LOGINS } from './login-policy.js';
import { IDENTITY_RATE_LIMITS } from './rate-limits.js';

const now = new Date('2026-11-08T10:00:00Z');
const minutes = (n: number) => new Date(now.getTime() + n * 60_000);

describe('login policy', () => {
  it('FR-ACC-02 five failed attempts lock the account for 15 minutes', () => {
    expect(MAX_FAILED_LOGINS).toBe(5);
    expect(LOCKOUT_MINUTES).toBe(15);

    let state = { failedLoginCount: 0, lockedUntil: null as Date | null };
    for (let attempt = 1; attempt < MAX_FAILED_LOGINS; attempt += 1) {
      state = afterFailedLogin(state, now);
      expect(state).toEqual({ failedLoginCount: attempt, lockedUntil: null });
    }
    state = afterFailedLogin(state, now);
    expect(state).toEqual({ failedLoginCount: 0, lockedUntil: minutes(15) });
  });

  it('FR-ACC-02 a lock holds until its end and not after', () => {
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(minutes(15), minutes(14))).toBe(true);
    expect(isLocked(minutes(15), minutes(15))).toBe(false);
  });

  it('clears a lapsed lock on the next failure', () => {
    const state = afterFailedLogin({ failedLoginCount: 0, lockedUntil: minutes(-1) }, now);
    expect(state).toEqual({ failedLoginCount: 1, lockedUntil: null });
  });

  it('NFR-08 limits login to 50 per address and 10 per email in 15 minutes', () => {
    expect(IDENTITY_RATE_LIMITS.login).toEqual({
      perIp: { limit: 50, windowSeconds: 900 },
      perEmail: { limit: 10, windowSeconds: 900 },
    });
  });
});
