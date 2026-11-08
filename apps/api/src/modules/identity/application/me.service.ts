import { HttpStatus, Injectable } from '@nestjs/common';
import type { MeResponse } from '@reih/contracts';
import { AppError } from '../../../shared/http/index.js';
import { UserRepository } from '../infrastructure/user.repository.js';
import { AgencyStatusPort, CurrencyPolicyPort } from './ports.js';

/** Prices are stored in AED, which is always enabled (BR-03, FR-ADM-05). */
const BASE_CURRENCY = 'AED';

/** The photo's file name changes with every upload, so it versions the URL against stale caches. */
export function photoUrl(photoPath: string | null): string | null {
  if (photoPath === null) return null;
  const version = photoPath.slice(photoPath.lastIndexOf('/') + 1).split('.')[0] ?? '';
  return `/api/v1/me/photo?v=${encodeURIComponent(version)}`;
}

@Injectable()
export class MeService {
  constructor(
    private readonly users: UserRepository,
    private readonly agencies: AgencyStatusPort,
    private readonly currencies: CurrencyPolicyPort,
  ) {}

  /** The caller's own account: user, role, agency and preferences. */
  async get(userId: string): Promise<MeResponse> {
    const profile = await this.users.findProfile(userId);
    if (!profile) {
      throw new AppError('UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }
    const [agency, currency] = await Promise.all([
      profile.agencyId ? this.agencies.getSummary(profile.agencyId) : null,
      this.displayCurrency(profile.prefCurrency),
    ]);
    return {
      user: {
        id: profile.id,
        email: profile.email,
        fullName: profile.fullName,
        mobile: profile.mobile,
        whatsapp: profile.whatsapp,
        jobTitle: profile.jobTitle,
        brn: profile.brn,
        photoUrl: photoUrl(profile.photoPath),
      },
      role: profile.role,
      agency,
      preferences: {
        language: profile.prefLanguage,
        currency,
        areaUnit: profile.prefAreaUnit,
      },
    };
  }

  /**
   * FR-LOC-01: a saved currency that the Platform Admin has since disabled is kept, but AED is shown
   * until it is enabled again (docs/decisions.md, P3.1).
   */
  private async displayCurrency(saved: string): Promise<string> {
    if (saved === BASE_CURRENCY) return saved;
    return (await this.currencies.isEnabledCurrency(saved)) ? saved : BASE_CURRENCY;
  }
}
