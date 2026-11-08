import { HttpStatus, Injectable } from '@nestjs/common';
import type { MeResponse } from '@reih/contracts';
import { AgencyService } from '../../agency/index.js';
import { AppError } from '../../../shared/http/index.js';
import { UserRepository } from '../infrastructure/user.repository.js';

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
    private readonly agencies: AgencyService,
  ) {}

  /** The caller's own account: user, role, agency and preferences. */
  async get(userId: string): Promise<MeResponse> {
    const profile = await this.users.findProfile(userId);
    if (!profile) {
      throw new AppError('UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }
    const agency = profile.agencyId ? await this.agencies.getSummary(profile.agencyId) : null;
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
        currency: profile.prefCurrency,
        areaUnit: profile.prefAreaUnit,
      },
    };
  }
}
