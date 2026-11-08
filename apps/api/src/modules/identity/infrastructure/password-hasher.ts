import { hash } from '@node-rs/argon2';

// The library's default algorithm is Argon2id (NFR-08); test/seeds.integration.test.ts checks the
// stored hash, which also records these parameters.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}
