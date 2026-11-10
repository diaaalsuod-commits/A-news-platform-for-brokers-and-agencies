import { DrizzleQueryError } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { isConnectionError, retryConnection } from './postgres.js';

const reset = () => Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
const refused = () => Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });

/** An attempt that fails with the given errors, in order, then succeeds. */
function flaky(...failures: Error[]) {
  const calls = { count: 0 };
  const attempt = async () => {
    calls.count += 1;
    const failure = failures[calls.count - 1];
    if (failure) throw failure;
    return 'connected';
  };
  return { attempt, calls };
}

const delays: number[] = [];
const sleep = async (ms: number) => {
  delays.push(ms);
};

describe('first database connection in test setup (NFR-13)', () => {
  it('NFR-13 a reset or refused first connection is tried again, after a short delay', async () => {
    delays.length = 0;
    const { attempt, calls } = flaky(reset(), refused());
    await expect(retryConnection(attempt, { sleep })).resolves.toBe('connected');
    expect(calls.count).toBe(3);
    expect(delays).toEqual([500, 500]);
  });

  it('NFR-13 it gives up after three tries and throws the last error', async () => {
    const last = reset();
    const { attempt, calls } = flaky(reset(), reset(), last, reset());
    await expect(retryConnection(attempt, { sleep })).rejects.toBe(last);
    expect(calls.count).toBe(3);
  });

  it('NFR-13 a reset wrapped by Drizzle, as in the failed migrate, counts as a connection error', async () => {
    const wrapped = new DrizzleQueryError('CREATE SCHEMA IF NOT EXISTS "drizzle"', [], reset());
    expect(isConnectionError(wrapped)).toBe(true);
    const { attempt, calls } = flaky(wrapped);
    await expect(retryConnection(attempt, { sleep })).resolves.toBe('connected');
    expect(calls.count).toBe(2);
  });

  it('NFR-13 any other failure is thrown at once and never tried again', async () => {
    const others = [
      Object.assign(new Error('password authentication failed'), { code: '28P01' }),
      Object.assign(new Error('relation "users" does not exist'), { code: '42P01' }),
      new Error('expected 200 to be 201'),
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }),
    ];
    for (const other of others) {
      const { attempt, calls } = flaky(other);
      await expect(retryConnection(attempt, { sleep })).rejects.toBe(other);
      expect(calls.count, other.message).toBe(1);
    }
  });
});
