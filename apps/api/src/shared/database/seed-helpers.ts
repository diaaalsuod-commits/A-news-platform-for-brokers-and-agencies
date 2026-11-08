import { createHash } from 'node:crypto';
import type { NodePgQueryResultHKT } from 'drizzle-orm/node-postgres';
import type { PgDatabase } from 'drizzle-orm/pg-core';

/** A database or a transaction. */
export type SeedDb = PgDatabase<NodePgQueryResultHKT>;

/** A seed that must not run. The command prints the message and exits without a stack trace. */
export class SeedRefused extends Error {
  override readonly name = 'SeedRefused';
}

/**
 * The same UUID for the same parts on every run. Together with ON CONFLICT DO NOTHING this is what
 * makes a seed idempotent, including on tables that have no unique column besides the id.
 */
export function seedId(...parts: (string | number)[]): string {
  const hash = createHash('sha1')
    .update(`reih-seed:${parts.join(':')}`)
    .digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export interface SeedRandom {
  /** A float from 0 up to, not including, 1. */
  next(): number;
  /** An integer from min to max, both included. */
  int(min: number, max: number): number;
  float(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Up to count different items. */
  sample<T>(items: readonly T[], count: number): T[];
}

/** A small generator (mulberry32) that repeats for the same seed. It is not for secrets. */
export function createSeedRandom(seed: string): SeedRandom {
  let state = createHash('sha1').update(seed).digest().readUInt32LE(0);

  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T;

  return {
    next,
    int,
    float: (min, max) => min + next() * (max - min),
    pick,
    sample: <T>(items: readonly T[], count: number): T[] => {
      const remaining = [...items];
      const chosen: T[] = [];
      while (chosen.length < count && remaining.length > 0) {
        chosen.push(remaining.splice(int(0, remaining.length - 1), 1)[0] as T);
      }
      return chosen;
    },
  };
}

export function* inBatches<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let start = 0; start < items.length; start += size) {
    yield items.slice(start, start + size);
  }
}
