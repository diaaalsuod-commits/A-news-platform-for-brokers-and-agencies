import { Inject, Injectable } from '@nestjs/common';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { settings } from './admin.schema.js';

export interface SettingsChanges {
  staleThresholdDays?: number;
  invitationValidityDays?: number;
  dailyRevealLimit?: number;
}

/** FR-ADM-06: writes the single settings row, which migration 0002 creates. */
@Injectable()
export class SettingsRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async update(changes: SettingsChanges, updatedBy: string, now: Date): Promise<void> {
    const updated = await this.db
      .update(settings)
      .set({ ...changes, updatedBy, updatedAt: now })
      .returning({ id: settings.id });
    if (updated.length !== 1) {
      throw new Error('Expected exactly one settings row; migration 0002 creates it.');
    }
  }
}
