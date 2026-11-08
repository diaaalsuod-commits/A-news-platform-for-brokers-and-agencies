import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/index.js';
import { CurrenciesController } from './api/currencies.controller.js';
import { RatesReader } from './application/rates-reader.js';
import { SettingsReader } from './application/settings-reader.js';
import { AdminReadRepository } from './infrastructure/admin-read.repository.js';

@Module({
  imports: [DatabaseModule],
  controllers: [CurrenciesController],
  providers: [AdminReadRepository, SettingsReader, RatesReader],
  exports: [SettingsReader, RatesReader],
})
export class AdminModule {}
