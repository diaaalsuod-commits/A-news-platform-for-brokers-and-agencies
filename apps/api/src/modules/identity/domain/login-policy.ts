/** FR-ACC-02: five failed attempts lock the account for 15 minutes. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

const FIFTEEN_MINUTES = 15 * 60;

/**
 * NFR-08: the login rate limits, the one place their numbers live (docs/decisions.md). The SRS sets
 * none. The per-address limit is generous because a whole office may share one address; the
 * per-email limit counts every address submitted, whether or not an account has it.
 */
export const LOGIN_RATE_LIMITS = {
  perIp: { limit: 50, windowSeconds: FIFTEEN_MINUTES },
  perEmail: { limit: 10, windowSeconds: FIFTEEN_MINUTES },
} as const;

export interface LoginAttemptState {
  failedLoginCount: number;
  lockedUntil: Date | null;
}

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * The state after one more failed attempt. The fifth locks the account and starts the count again,
 * so five fresh attempts are allowed once the lock ends. A lapsed lock is cleared.
 */
export function afterFailedLogin(state: LoginAttemptState, now: Date): LoginAttemptState {
  const failedLoginCount = state.failedLoginCount + 1;
  if (failedLoginCount >= MAX_FAILED_LOGINS) {
    return {
      failedLoginCount: 0,
      lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000),
    };
  }
  return {
    failedLoginCount,
    lockedUntil: isLocked(state.lockedUntil, now) ? state.lockedUntil : null,
  };
}
