import { describe, expect, it } from 'vitest';
import { isAcceptablePassword, MAX_PASSWORD_LENGTH, passwordSchema } from './password.js';

describe('password rule', () => {
  it('FR-ACC-01 a password has at least 10 characters', () => {
    expect(isAcceptablePassword('a'.repeat(9))).toBe(false);
    expect(isAcceptablePassword('a'.repeat(10))).toBe(true);
  });

  it('NFR-08 a password is at most 1024 characters', () => {
    expect(MAX_PASSWORD_LENGTH).toBe(1024);
    expect(passwordSchema.safeParse('a'.repeat(1024)).success).toBe(true);
    expect(passwordSchema.safeParse('a'.repeat(1025)).success).toBe(false);
  });
});
