import { Global, Module, type Provider } from '@nestjs/common';
import { AdminModule, RatesReader, SettingsReader } from './modules/admin/index.js';
import { AgencyModule, AgencyService } from './modules/agency/index.js';
import {
  AgencyStatusPort,
  CurrencyPolicyPort,
  IdentitySettingsPort,
} from './modules/identity/index.js';

/** A typed useExisting: the implementation must have every method the port declares. */
function bind<T>(
  port: abstract new () => T,
  implementation: new (...args: never[]) => T,
): Provider {
  return { provide: port, useExisting: implementation };
}

/**
 * Binds identity's ports to agency's and admin's public services (docs/decisions.md, P3.1).
 *
 * Identity imports no other module, and agency and admin import identity, so the module graph runs
 * one way. Global modules are not import edges in Nest, so this adds no cycle. A missing binding
 * stops the application at startup, which every API test exercises.
 *
 * AgencyService, SettingsReader and RatesReader must never depend on an identity provider, or the
 * providers would form a cycle.
 */
@Global()
@Module({
  imports: [AgencyModule, AdminModule],
  providers: [
    bind(AgencyStatusPort, AgencyService),
    bind(IdentitySettingsPort, SettingsReader),
    bind(CurrencyPolicyPort, RatesReader),
  ],
  exports: [AgencyStatusPort, IdentitySettingsPort, CurrencyPolicyPort],
})
export class IdentityPortsModule {}
