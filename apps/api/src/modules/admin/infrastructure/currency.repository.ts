import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { currencies, exchangeRates } from './admin.schema.js';

export interface CurrencyRow {
  id: string;
  code: string;
  symbol: string;
  nameAr: string;
  nameEn: string;
  isEnabled: boolean;
}

export interface RateRow {
  id: string;
  currencyCode: string;
  aedPerUnit: string;
  effectiveAt: Date;
  enteredBy: string;
  createdAt: Date;
}

const currencyColumns = {
  id: currencies.id,
  code: currencies.code,
  symbol: currencies.symbol,
  nameAr: currencies.nameAr,
  nameEn: currencies.nameEn,
  isEnabled: currencies.isEnabled,
};

const rateColumns = {
  id: exchangeRates.id,
  currencyCode: currencies.code,
  aedPerUnit: exchangeRates.aedPerUnit,
  effectiveAt: exchangeRates.effectiveAt,
  enteredBy: exchangeRates.enteredBy,
  createdAt: exchangeRates.createdAt,
};

/** The latest rate wins: the latest effective date, and of one date, the latest entered. */
const latestFirst = [desc(exchangeRates.effectiveAt), desc(exchangeRates.createdAt)];

/** FR-ADM-05, FR-LOC-01: display currencies and their dated exchange rates. */
@Injectable()
export class CurrencyRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** AED first, then by code. */
  async list(page: number, pageSize: number): Promise<{ items: CurrencyRow[]; total: number }> {
    const [items, [totals]] = await Promise.all([
      this.db
        .select(currencyColumns)
        .from(currencies)
        .orderBy(sql`${currencies.code} <> 'AED'`, asc(currencies.code))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ total: count() }).from(currencies),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  async findByCode(code: string): Promise<CurrencyRow | null> {
    const [row] = await this.db
      .select(currencyColumns)
      .from(currencies)
      .where(eq(currencies.code, code));
    return row ?? null;
  }

  async setEnabled(code: string, isEnabled: boolean, now: Date): Promise<void> {
    await this.db
      .update(currencies)
      .set({ isEnabled, updatedAt: now })
      .where(eq(currencies.code, code));
  }

  /**
   * FR-ADM-05: stores a new dated rate, earlier rates staying as history. A disabled currency is
   * enabled in the same transaction (UC-06.5 sequence diagram).
   */
  async addRate(input: {
    currencyId: string;
    aedPerUnit: string;
    effectiveAt: Date;
    enteredBy: string;
    now: Date;
  }): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(exchangeRates)
        .values({
          currencyId: input.currencyId,
          aedPerUnit: input.aedPerUnit,
          effectiveAt: input.effectiveAt,
          enteredBy: input.enteredBy,
        })
        .returning({ id: exchangeRates.id });
      await tx
        .update(currencies)
        .set({ isEnabled: true, updatedAt: input.now })
        .where(and(eq(currencies.id, input.currencyId), eq(currencies.isEnabled, false)));
      return (row as { id: string }).id;
    });
  }

  async findRate(rateId: string): Promise<RateRow | null> {
    const [row] = await this.db
      .select(rateColumns)
      .from(exchangeRates)
      .innerJoin(currencies, eq(currencies.id, exchangeRates.currencyId))
      .where(eq(exchangeRates.id, rateId));
    return row ?? null;
  }

  async hasRate(currencyId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: exchangeRates.id })
      .from(exchangeRates)
      .where(eq(exchangeRates.currencyId, currencyId))
      .limit(1);
    return row !== undefined;
  }

  /** The rate history of one currency, latest first. */
  async listRates(
    currencyId: string,
    page: number,
    pageSize: number,
  ): Promise<{ items: RateRow[]; total: number }> {
    const where = eq(exchangeRates.currencyId, currencyId);
    const [items, [totals]] = await Promise.all([
      this.db
        .select(rateColumns)
        .from(exchangeRates)
        .innerJoin(currencies, eq(currencies.id, exchangeRates.currencyId))
        .where(where)
        .orderBy(...latestFirst)
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      this.db.select({ total: count() }).from(exchangeRates).where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  /** The latest rate of each of these currencies. */
  async latestRates(currencyIds: string[]): Promise<Map<string, RateRow>> {
    if (currencyIds.length === 0) return new Map();
    const rows = await this.db
      .selectDistinctOn([exchangeRates.currencyId], {
        ...rateColumns,
        currencyId: exchangeRates.currencyId,
      })
      .from(exchangeRates)
      .innerJoin(currencies, eq(currencies.id, exchangeRates.currencyId))
      .where(inArray(exchangeRates.currencyId, currencyIds))
      .orderBy(exchangeRates.currencyId, ...latestFirst);
    return new Map(rows.map(({ currencyId, ...rate }) => [currencyId, rate]));
  }

  /**
   * FR-LOC-01: the latest rate of an enabled currency, read fresh on each call so a new rate
   * applies at once. Null for a disabled currency or one without a rate.
   */
  async latestEnabledRate(code: string): Promise<RateRow | null> {
    const [row] = await this.db
      .select(rateColumns)
      .from(exchangeRates)
      .innerJoin(currencies, eq(currencies.id, exchangeRates.currencyId))
      .where(and(eq(currencies.code, code), eq(currencies.isEnabled, true)))
      .orderBy(...latestFirst)
      .limit(1);
    return row ?? null;
  }
}
