import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type AddExchangeRateRequest,
  addExchangeRateRequestSchema,
  type AdminCurrency,
  type AdminCurrencyListResponse,
  currencyCodeParamSchema,
  type ExchangeRate,
  type ExchangeRateListResponse,
  type PageQuery,
  pageQuerySchema,
  type UpdateCurrencyRequest,
  updateCurrencyRequestSchema,
} from '@reih/contracts';
import {
  CurrentUser,
  type RequestUser,
  Roles,
  ZodValidationPipe,
} from '../../../shared/http/index.js';
import { CurrencyService } from '../application/currency.service.js';

const code = new ZodValidationPipe(currencyCodeParamSchema);

/** FR-ADM-05, FR-LOC-01, UC-06.5: display currencies and dated exchange rates. */
@Roles('platform_admin')
@Controller('admin/currencies')
export class AdminCurrenciesController {
  constructor(private readonly currencies: CurrencyService) {}

  /** Every currency, AED first, with its latest rate. */
  @Get()
  list(
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
  ): Promise<AdminCurrencyListResponse> {
    return this.currencies.list(query);
  }

  /** Enable or disable a currency. AED is always on; enabling needs a stored rate. */
  @Patch(':code')
  update(
    @Param('code', code) currencyCode: string,
    @Body(new ZodValidationPipe(updateCurrencyRequestSchema)) body: UpdateCurrencyRequest,
  ): Promise<AdminCurrency> {
    return this.currencies.setEnabled(currencyCode, body.isEnabled);
  }

  /** The rate history, latest first. */
  @Get(':code/rates')
  rates(
    @Param('code', code) currencyCode: string,
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
  ): Promise<ExchangeRateListResponse> {
    return this.currencies.listRates(currencyCode, query);
  }

  /** A new dated rate; it applies at once. */
  @Post(':code/rates')
  addRate(
    @Param('code', code) currencyCode: string,
    @Body(new ZodValidationPipe(addExchangeRateRequestSchema)) body: AddExchangeRateRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<ExchangeRate> {
    return this.currencies.addRate(currencyCode, body, user.id);
  }
}
