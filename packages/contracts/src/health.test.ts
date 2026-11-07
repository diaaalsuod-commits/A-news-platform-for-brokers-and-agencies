import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.js';

describe('healthResponseSchema', () => {
  it('accepts a healthy response', () => {
    const body = { status: 'ok', db: 'up', redis: 'up' };
    expect(healthResponseSchema.parse(body)).toEqual(body);
  });

  it('accepts a degraded response', () => {
    const body = { status: 'degraded', db: 'down', redis: 'up' };
    expect(healthResponseSchema.parse(body)).toEqual(body);
  });

  it('rejects an unknown service state', () => {
    expect(healthResponseSchema.safeParse({ status: 'ok', db: 'maybe', redis: 'up' }).success).toBe(
      false,
    );
  });
});
