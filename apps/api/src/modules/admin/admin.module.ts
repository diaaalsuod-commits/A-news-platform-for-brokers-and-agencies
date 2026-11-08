import { Module } from '@nestjs/common';
import { AgencyModule } from '../agency/index.js';
import { IdentityModule } from '../identity/index.js';
import { DatabaseModule } from '../../shared/database/index.js';
import { AdminAgenciesController } from './api/admin-agencies.controller.js';
import { AdminCurrenciesController } from './api/admin-currencies.controller.js';
import { AdminInvitationsController } from './api/admin-invitations.controller.js';
import { AdminReferenceController } from './api/admin-reference.controller.js';
import { AdminSettingsController } from './api/admin-settings.controller.js';
import { AdminStaffController } from './api/admin-staff.controller.js';
import { CurrenciesController } from './api/currencies.controller.js';
import { AgencyOnboardingService } from './application/agency-onboarding.service.js';
import { CurrencyService } from './application/currency.service.js';
import { RatesReader } from './application/rates-reader.js';
import { ReferenceDataReader } from './application/reference-data-reader.js';
import { ReferenceDataService } from './application/reference-data.service.js';
import { SettingsReader } from './application/settings-reader.js';
import { SettingsService } from './application/settings.service.js';
import { AdminReadRepository } from './infrastructure/admin-read.repository.js';
import { CurrencyRepository } from './infrastructure/currency.repository.js';
import { ReferenceDataRepository } from './infrastructure/reference-data.repository.js';
import { SettingsRepository } from './infrastructure/settings.repository.js';

@Module({
  // docs/decisions.md (P3.1): admin -> agency -> identity, one way. SettingsReader and RatesReader
  // are bound to identity's ports and must never depend on an identity provider.
  imports: [DatabaseModule, AgencyModule, IdentityModule],
  controllers: [
    CurrenciesController,
    AdminAgenciesController,
    AdminStaffController,
    AdminInvitationsController,
    AdminReferenceController,
    AdminCurrenciesController,
    AdminSettingsController,
  ],
  providers: [
    AdminReadRepository,
    CurrencyRepository,
    ReferenceDataRepository,
    SettingsRepository,
    SettingsReader,
    RatesReader,
    ReferenceDataReader,
    ReferenceDataService,
    CurrencyService,
    SettingsService,
    AgencyOnboardingService,
  ],
  exports: [SettingsReader, RatesReader, ReferenceDataReader],
})
export class AdminModule {}
