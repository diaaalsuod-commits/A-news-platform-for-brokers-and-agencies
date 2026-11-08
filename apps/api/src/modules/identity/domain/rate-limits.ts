/**
 * NFR-08: every rate limit of the identity module, the one place their numbers live
 * (docs/decisions.md). The SRS sets none. Each is a fixed window.
 */
const minutes = (n: number) => n * 60;

export const IDENTITY_RATE_LIMITS = {
  /** Generous per address, because a whole office may share one; per email alike for unknown ones. */
  login: {
    perIp: { limit: 50, windowSeconds: minutes(15) },
    perEmail: { limit: 10, windowSeconds: minutes(15) },
  },
  forgot: {
    perIp: { limit: 10, windowSeconds: minutes(15) },
    perEmail: { limit: 3, windowSeconds: minutes(60) },
  },
  /** The body has no email, so the second key is the link token. */
  reset: {
    perIp: { limit: 20, windowSeconds: minutes(15) },
    perToken: { limit: 5, windowSeconds: minutes(15) },
  },
  /** Checking an invitation link and activating with it. */
  invitation: {
    perIp: { limit: 20, windowSeconds: minutes(15) },
    perToken: { limit: 10, windowSeconds: minutes(15) },
  },
  /** On top of the failed-attempt lockout, which a wrong current password also feeds. */
  passwordChange: {
    perUser: { limit: 5, windowSeconds: minutes(15) },
  },
} as const;
