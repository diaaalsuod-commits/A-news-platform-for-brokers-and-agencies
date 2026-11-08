import type { AgencyStatus } from '@reih/contracts';

export type AgencyStatusAction = 'suspend' | 'reactivate';

/** FR-ADM-02: the status an action expects and the one it sets. */
export const AGENCY_TRANSITIONS: Record<
  AgencyStatusAction,
  {
    from: AgencyStatus;
    to: AgencyStatus;
    alreadyCode: 'AGENCY_ALREADY_SUSPENDED' | 'AGENCY_ALREADY_ACTIVE';
  }
> = {
  suspend: { from: 'active', to: 'suspended', alreadyCode: 'AGENCY_ALREADY_SUSPENDED' },
  reactivate: { from: 'suspended', to: 'active', alreadyCode: 'AGENCY_ALREADY_ACTIVE' },
};

/**
 * FR-ADM-02: suspending and reactivating both need a reason. Returns the trimmed reason, or null
 * when it is empty or blank, which the caller refuses.
 */
export function statusReason(reason: string | null | undefined): string | null {
  const trimmed = reason?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
