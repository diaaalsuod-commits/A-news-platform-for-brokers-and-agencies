/** FR-ACC-02: a session ends after 8 hours without activity. */
export const SESSION_IDLE_TIMEOUT_MS = 8 * 60 * 60_000;

/**
 * Sliding expiry is written at most once a minute, not on every request (docs/decisions.md). A
 * session can therefore end up to one minute before 8 hours after the very last request.
 */
export const SESSION_TOUCH_INTERVAL_MS = 60_000;

export function sessionExpiresAt(lastActivityAt: Date): Date {
  return new Date(lastActivityAt.getTime() + SESSION_IDLE_TIMEOUT_MS);
}

export interface SessionTimes {
  expiresAt: Date;
  endedAt: Date | null;
}

export function isSessionLive(session: SessionTimes, now: Date): boolean {
  return session.endedAt === null && session.expiresAt.getTime() > now.getTime();
}

export function shouldTouch(lastActivityAt: Date, now: Date): boolean {
  return now.getTime() - lastActivityAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}
