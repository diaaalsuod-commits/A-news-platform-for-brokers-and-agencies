import type { MeAgency } from '@reih/contracts';

/*
 * What identity needs from other modules, declared here so that identity imports no other module
 * (docs/decisions.md, P3.1). src/identity-ports.module.ts binds each port to the owning module's
 * public service; agency and admin import identity, never the other way round.
 */

/** BR-13 and GET /me: an agency's status and names. Bound to agency's AgencyService. */
export abstract class AgencyStatusPort {
  /** False for a suspended agency, and for an id that names no agency. */
  abstract isActive(agencyId: string): Promise<boolean>;
  /** Null for an id that names no agency. */
  abstract getSummary(agencyId: string): Promise<MeAgency | null>;
}

export interface IdentitySettings {
  invitationValidityDays: number;
  currentTermsVersion: string;
}

/** FR-ADM-06: the settings identity reads, fresh on each call. Bound to admin's SettingsReader. */
export abstract class IdentitySettingsPort {
  abstract get(): Promise<IdentitySettings>;
}

/** FR-ACC-06, FR-ADM-05: whether a display currency is enabled. Bound to admin's RatesReader. */
export abstract class CurrencyPolicyPort {
  abstract isEnabledCurrency(code: string): Promise<boolean>;
}
