import { Inject, Injectable } from '@nestjs/common';
import type { AreaUnit, LangCode, UserRole, UserStatus } from '@reih/contracts';
import { and, eq, isNull, ne } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { afterFailedLogin } from '../domain/login-policy.js';
import { sessions, users } from './identity.schema.js';

export interface LoginCandidate {
  id: string;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
  agencyId: string | null;
  lockedUntil: Date | null;
  prefLanguage: LangCode;
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
  photoPath: string | null;
}

export interface ProfileChanges {
  fullName?: string;
  mobile?: string | null;
  whatsapp?: string | null;
  jobTitle?: string | null;
  brn?: string | null;
}

export interface PreferenceChanges {
  prefLanguage?: LangCode;
  prefCurrency?: string;
  prefAreaUnit?: AreaUnit;
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
        prefLanguage: users.prefLanguage,
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
        photoPath: users.photoPath,
      })
      .from(users)
      .where(eq(users.id, userId));
    return row ?? null;
  }

  async findCredentials(
    userId: string,
  ): Promise<{ passwordHash: string | null; lockedUntil: Date | null } | null> {
    const [row] = await this.db
      .select({ passwordHash: users.passwordHash, lockedUntil: users.lockedUntil })
      .from(users)
      .where(eq(users.id, userId));
    return row ?? null;
  }

  /**
   * FR-ACC-03: a new password clears the failed attempts and the lock, and ends the user's sessions,
   * all of them or all but the one that made the change, in the same transaction.
   */
  async changePassword(
    userId: string,
    passwordHash: string,
    now: Date,
    keepSessionId: string | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, failedLoginCount: 0, lockedUntil: null, updatedAt: now })
        .where(eq(users.id, userId));
      await tx
        .update(sessions)
        .set({ endedAt: now })
        .where(
          and(
            eq(sessions.userId, userId),
            isNull(sessions.endedAt),
            keepSessionId === null ? undefined : ne(sessions.id, keepSessionId),
          ),
        );
    });
  }

  async updateProfile(userId: string, changes: ProfileChanges, now: Date): Promise<void> {
    await this.db
      .update(users)
      .set({ ...changes, updatedAt: now })
      .where(eq(users.id, userId));
  }

  async updatePreferences(userId: string, changes: PreferenceChanges, now: Date): Promise<void> {
    await this.db
      .update(users)
      .set({ ...changes, updatedAt: now })
      .where(eq(users.id, userId));
  }

  /** Sets or clears the photo. The previous file is left on disk (docs/decisions.md, P3.2). */
  async setPhoto(userId: string, photoPath: string | null, now: Date): Promise<void> {
    await this.db.update(users).set({ photoPath, updatedAt: now }).where(eq(users.id, userId));
  }
}
