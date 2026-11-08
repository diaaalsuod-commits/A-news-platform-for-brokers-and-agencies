import { Injectable } from '@nestjs/common';
import type { MeAgency } from '@reih/contracts';
import { AgencyRepository } from '../infrastructure/agency.repository.js';

/** The agency module's public service. Other modules reach agencies only through it (rule 2). */
@Injectable()
export class AgencyService {
  constructor(private readonly agencies: AgencyRepository) {}

  /** BR-13: false for a suspended agency, and for an id that names no agency. */
  async isActive(agencyId: string): Promise<boolean> {
    const agency = await this.agencies.findById(agencyId);
    return agency?.status === 'active';
  }

  /** The names shown with a user's own account (GET /me). Null for an id that names no agency. */
  async getSummary(agencyId: string): Promise<MeAgency | null> {
    const agency = await this.agencies.findById(agencyId);
    return agency ? { id: agency.id, nameAr: agency.nameAr, nameEn: agency.nameEn } : null;
  }
}
