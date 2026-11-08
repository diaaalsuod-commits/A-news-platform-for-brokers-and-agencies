import { describe, expect, it } from 'vitest';
import {
  isSessionLive,
  SESSION_IDLE_TIMEOUT_MS,
  sessionExpiresAt,
  shouldTouch,
} from './session-policy.js';

const now = new Date('2026-11-08T10:00:00Z');
const later = (ms: number) => new Date(now.getTime() + ms);

describe('session policy', () => {
  it('FR-ACC-02 a session expires 8 hours after the last activity', () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(8 * 60 * 60 * 1000);
    expect(sessionExpiresAt(now)).toEqual(new Date('2026-11-08T18:00:00Z'));
  });

  it('FR-ACC-02 a session is live until it expires or is ended', () => {
    const expiresAt = sessionExpiresAt(now);
    expect(isSessionLive({ expiresAt, endedAt: null }, later(1_000))).toBe(true);
    expect(isSessionLive({ expiresAt, endedAt: null }, expiresAt)).toBe(false);
    expect(isSessionLive({ expiresAt, endedAt: now }, later(1_000))).toBe(false);
  });

  it('writes the sliding expiry at most once a minute', () => {
    expect(shouldTouch(now, later(59_999))).toBe(false);
    expect(shouldTouch(now, later(60_000))).toBe(true);
  });
});
