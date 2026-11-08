import { Inject, Injectable } from '@nestjs/common';
import type { Currency } from '@reih/contracts';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { currencies, settings } from './admin.schema.js';

export interface SettingsRow {
  staleThresholdDays: number;
  invitationValidityDays: number;
  dailyRevealLimit: number;
  currentTermsVersion: string;
  updatedAt: Date;
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
        updatedAt: settings.updatedAt,
      })
      .from(settings)
      .limit(1);
    if (!row) {
      throw new Error('The settings row is missing; migration 0002 creates it.');
    }
    return row;
  }

  /** AED first, then by code; the page is one of { page, pageSize }. */
  async enabledCurrencies(
    page: number,
    pageSize: number,
  ): Promise<{ items: Currency[]; total: number }> {
    const enabled = eq(currencies.isEnabled, true);
    const [items, [totals]] = await Promise.all([
      this.db
        .select({
          code: currencies.code,
          symbol: currencies.symbol,
          nameAr: currencies.nameAr,
          nameEn: currencies.nameEn,
        })
        .from(currencies)
        .where(enabled)
        .orderBy(sql`${currencies.code} <> 'AED'`, asc(currencies.code))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ total: count() }).from(currencies).where(enabled),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  async isEnabledCurrency(code: string): Promise<boolean> {
    const [row] = await this.db
      .select({ code: currencies.code })
      .from(currencies)
      .where(and(eq(currencies.code, code), eq(currencies.isEnabled, true)));
    return row !== undefined;
  }
}
