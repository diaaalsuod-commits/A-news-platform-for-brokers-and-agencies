import { Injectable } from '@nestjs/common';
import { BASE_CURRENCY, type CurrencyListResponse, type PageQuery } from '@reih/contracts';
import { canonicalRate, uaeDate } from '../domain/rates.js';
import { AdminReadRepository } from '../infrastructure/admin-read.repository.js';
import { CurrencyRepository } from '../infrastructure/currency.repository.js';

/** FR-LOC-01: the rate to convert a price with, and the date shown next to it. */
export interface LatestRate {
  /** catalog_versions.exchange_rate_id records it (FR-ADM-05, FR-CAT-06). */
  rateId: string;
  code: string;
  /** AED per unit as a decimal string; use it with decimal.js, never as a float. */
  aedPerUnit: string;
  effectiveAt: Date;
  /** The UAE calendar day the rate applies from. */
  effectiveDate: string;
}

/** FR-ADM-05: display currencies and their exchange rates. */
@Injectable()
export class RatesReader {
  constructor(
    private readonly repository: AdminReadRepository,
    private readonly currencies: CurrencyRepository,
  ) {}

  /** FR-ACC-06: the currencies a user may choose for display. */
  async listEnabledCurrencies({ page, pageSize }: PageQuery): Promise<CurrencyListResponse> {
    const { items, total } = await this.repository.enabledCurrencies(page, pageSize);
    return { items, total, page, pageSize };
  }

  /** FR-ACC-06: true only for a currency that exists and that the Platform Admin enabled. */
  isEnabledCurrency(code: string): Promise<boolean> {
    return this.repository.isEnabledCurrency(code);
  }

  /**
   * FR-LOC-01, FR-ADM-05: the latest rate of an enabled currency, read fresh so a new rate applies
   * at once. Null for AED (prices are stored in it), for a disabled currency and for one without a
   * rate: the caller then shows the AED price only.
   */
  async latest(code: string): Promise<LatestRate | null> {
    const normalised = code.trim().toUpperCase();
    if (normalised === BASE_CURRENCY) return null;
    const rate = await this.currencies.latestEnabledRate(normalised);
    if (!rate) return null;
    return {
      rateId: rate.id,
      code: rate.currencyCode,
      aedPerUnit: canonicalRate(rate.aedPerUnit),
      effectiveAt: rate.effectiveAt,
      effectiveDate: uaeDate(rate.effectiveAt),
    };
  }
}
