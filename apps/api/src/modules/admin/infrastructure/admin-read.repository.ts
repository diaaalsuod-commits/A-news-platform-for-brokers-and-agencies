import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { currencies, settings } from './admin.schema.js';

export interface SettingsRow {
  staleThresholdDays: number;
  invitationValidityDays: number;
  dailyRevealLimit: number;
  currentTermsVersion: string;
}

@Injectable()
export class AdminReadRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** The single settings row, which migration 0002 creates. */
  async settings(): Promise<SettingsRow> {
    const [row] = await this.db
      .select({
        staleThresholdDays: settings.staleThresholdDays,
        invitationValidityDays: settings.invitationValidityDays,
        dailyRevealLimit: settings.dailyRevealLimit,
        currentTermsVersion: settings.currentTermsVersion,
      })
      .from(settings)
      .limit(1);
    if (!row) {
      throw new Error('The settings row is missing; migration 0002 creates it.');
    }
    return row;
  }

  async isEnabledCurrency(code: string): Promise<boolean> {
    const [row] = await this.db
      .select({ code: currencies.code })
      .from(currencies)
      .where(and(eq(currencies.code, code), eq(currencies.isEnabled, true)));
    return row !== undefined;
  }
}
