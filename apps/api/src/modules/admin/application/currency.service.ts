import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type AddExchangeRateRequest,
  type AdminCurrency,
  type AdminCurrencyListResponse,
  BASE_CURRENCY,
  type ExchangeRate,
  type ExchangeRateListResponse,
  type PageQuery,
} from '@reih/contracts';
import { AppError } from '../../../shared/http/index.js';
import {
  canonicalRate,
  effectiveAtOf,
  isFutureUaeDate,
  normaliseRate,
  uaeDate,
} from '../domain/rates.js';
import {
  CurrencyRepository,
  type CurrencyRow,
  type RateRow,
} from '../infrastructure/currency.repository.js';

function toRate(row: RateRow): ExchangeRate {
  return {
    id: row.id,
    currencyCode: row.currencyCode,
    aedPerUnit: canonicalRate(row.aedPerUnit),
    effectiveDate: uaeDate(row.effectiveAt),
    effectiveAt: row.effectiveAt.toISOString(),
    enteredBy: row.enteredBy,
    createdAt: row.createdAt.toISOString(),
  };
}

function toCurrency(row: CurrencyRow, latest: RateRow | undefined): AdminCurrency {
  return {
    code: row.code,
    symbol: row.symbol,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    isEnabled: row.isEnabled,
    latestRate: latest ? toRate(latest) : null,
  };
}

const aedFixed = () => new AppError('AED_FIXED', HttpStatus.CONFLICT);

/**
 * FR-ADM-05, FR-LOC-01, UC-06.5: display currencies and dated rates. AED is always enabled and has
 * no rate. Rates are decimal strings throughout; nothing here is a float.
 */
@Injectable()
export class CurrencyService {
  constructor(private readonly currencies: CurrencyRepository) {}

  async list({ page, pageSize }: PageQuery): Promise<AdminCurrencyListResponse> {
    const { items, total } = await this.currencies.list(page, pageSize);
    const latest = await this.currencies.latestRates(items.map((row) => row.id));
    return {
      items: items.map((row) => toCurrency(row, latest.get(row.id))),
      total,
      page,
      pageSize,
    };
  }

  async get(code: string): Promise<AdminCurrency> {
    const currency = await this.find(code);
    const latest = await this.currencies.latestRates([currency.id]);
    return toCurrency(currency, latest.get(currency.id));
  }

  /**
   * Enabling needs a stored rate, so an enabled currency always has one. Disabling keeps the users
   * who chose it: they see AED until it is enabled again (GET /me, RatesReader.latest).
   */
  async setEnabled(code: string, isEnabled: boolean): Promise<AdminCurrency> {
    const currency = await this.find(code);
    if (currency.code === BASE_CURRENCY) throw aedFixed();
    if (isEnabled && !(await this.currencies.hasRate(currency.id))) {
      throw new AppError('CURRENCY_HAS_NO_RATE', HttpStatus.CONFLICT);
    }
    await this.currencies.setEnabled(currency.code, isEnabled, new Date());
    return this.get(currency.code);
  }

  /**
   * FR-ADM-05: a new dated rate applies at once; earlier ones stay as history. The date is a UAE
   * calendar day, today or earlier. A disabled currency is enabled with its first rate.
   */
  async addRate(code: string, input: AddExchangeRateRequest, by: string): Promise<ExchangeRate> {
    const currency = await this.find(code);
    if (currency.code === BASE_CURRENCY) throw aedFixed();
    const now = new Date();
    if (isFutureUaeDate(input.effectiveDate, now)) {
      throw new AppError('RATE_DATE_IN_FUTURE', HttpStatus.BAD_REQUEST);
    }
    const aedPerUnit = normaliseRate(input.aedPerUnit);
    if (aedPerUnit === null) {
      throw new AppError('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, {
        issues: [{ path: 'aedPerUnit', code: 'too_small' }],
      });
    }
    const id = await this.currencies.addRate({
      currencyId: currency.id,
      aedPerUnit,
      effectiveAt: effectiveAtOf(input.effectiveDate),
      enteredBy: by,
      now,
    });
    return toRate((await this.currencies.findRate(id)) as RateRow);
  }

  async listRates(code: string, { page, pageSize }: PageQuery): Promise<ExchangeRateListResponse> {
    const currency = await this.find(code);
    const { items, total } = await this.currencies.listRates(currency.id, page, pageSize);
    return { items: items.map(toRate), total, page, pageSize };
  }

  private async find(code: string): Promise<CurrencyRow> {
    const currency = await this.currencies.findByCode(code);
    if (!currency) throw new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
    return currency;
  }
}
