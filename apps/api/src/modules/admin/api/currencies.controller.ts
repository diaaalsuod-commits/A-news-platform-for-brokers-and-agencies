import { Controller, Get, Query } from '@nestjs/common';
import { type CurrencyListResponse, type PageQuery, pageQuerySchema } from '@reih/contracts';
import { Roles, ZodValidationPipe } from '../../../shared/http/index.js';
import { RatesReader } from '../application/rates-reader.js';

@Controller('currencies')
export class CurrenciesController {
  constructor(private readonly rates: RatesReader) {}

  /** FR-ACC-06: the enabled display currencies, for the preferences screen. */
  @Roles('broker', 'agency_admin', 'data_operator', 'platform_admin')
  @Get()
  list(
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
  ): Promise<CurrencyListResponse> {
    return this.rates.listEnabledCurrencies(query);
  }
}
