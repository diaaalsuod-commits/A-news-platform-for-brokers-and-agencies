import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

// The library's default algorithm is Argon2id (NFR-08); test/seeds.integration.test.ts checks the
// stored hash, which also records these parameters.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

@Injectable()
export class PasswordHasher {
  private dummyHash: Promise<string> | undefined;

  /** False for a wrong password and for a stored value that is not a valid hash. */
  async verify(password: string, passwordHash: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  /**
   * Spends the time of one verification when there is no hash to check (unknown email, account
   * without a password, locked account), so the response time does not tell them apart (FR-ACC-02).
   */
  async verifyNothing(password: string): Promise<void> {
    this.dummyHash ??= hashPassword('reih-timing-equaliser-not-a-password');
    await this.verify(password, await this.dummyHash);
  }
}
