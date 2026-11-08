export { AdminModule } from './admin.module.js';
export { type LatestRate, RatesReader } from './application/rates-reader.js';
export { ReferenceDataReader } from './application/reference-data-reader.js';
export { type PlatformSettings, SettingsReader } from './application/settings-reader.js';
export {
  readSeedReferences,
  seedAdminReference,
  seedDemoExchangeRates,
} from './infrastructure/admin.seed.js';
