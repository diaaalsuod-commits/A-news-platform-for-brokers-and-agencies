import { Inject, Injectable } from '@nestjs/common';
import type { AreaUnit, LangCode, UserRole, UserStatus } from '@reih/contracts';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { afterFailedLogin } from '../domain/login-policy.js';
import { users } from './identity.schema.js';

export interface LoginCandidate {
  id: string;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  agencyId: string | null;
  lockedUntil: Date | null;
}

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  agencyId: string | null;
  fullName: string | null;
  mobile: string | null;
  whatsapp: string | null;
  jobTitle: string | null;
  brn: string | null;
  prefLanguage: LangCode;
  prefCurrency: string;
  prefAreaUnit: AreaUnit;
}

@Injectable()
export class UserRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** email is citext, so the match ignores case. */
  async findByEmail(email: string): Promise<LoginCandidate | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
        role: users.role,
        status: users.status,
        agencyId: users.agencyId,
        lockedUntil: users.lockedUntil,
      })
      .from(users)
      .where(eq(users.email, email));
    return row ?? null;
  }

  /** FR-ACC-02. The row lock makes concurrent failures count one by one. */
  async recordFailedLogin(userId: string, now: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ failedLoginCount: users.failedLoginCount, lockedUntil: users.lockedUntil })
        .from(users)
        .where(eq(users.id, userId))
        .for('update');
      if (!current) {
        return;
      }
      const next = afterFailedLogin(current, now);
      await tx
        .update(users)
        .set({ ...next, updatedAt: now })
        .where(eq(users.id, userId));
    });
  }

  /** A successful login clears the failed attempts and records the time (FR-AGY-03 shows it). */
  async recordLogin(userId: string, now: Date): Promise<void> {
    await this.db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, updatedAt: now })
      .where(eq(users.id, userId));
  }

  async findProfile(userId: string): Promise<UserProfile | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        agencyId: users.agencyId,
        fullName: users.fullName,
        mobile: users.mobile,
        whatsapp: users.whatsapp,
        jobTitle: users.jobTitle,
        brn: users.brn,
        prefLanguage: users.prefLanguage,
        prefCurrency: users.prefCurrency,
        prefAreaUnit: users.prefAreaUnit,
      })
      .from(users)
      .where(eq(users.id, userId));
    return row ?? null;
  }
}
