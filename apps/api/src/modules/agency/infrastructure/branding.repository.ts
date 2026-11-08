import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE } from '../../../shared/database/index.js';
import { agencies, agencyBranding } from './agency.schema.js';

export interface BrandingRow {
  agencyId: string;
  nameAr: string;
  nameEn: string;
  /** Null when the agency has no branding row yet: the defaults apply. */
  marketingName: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  orn: string | null;
  logoPath: string | null;
  updatedAt: Date | null;
}

export interface BrandingFields {
  marketingName: string;
  primaryColor: string;
  secondaryColor: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  orn: string | null;
}

/** FR-AGY-01: one branding row per agency, created on its first save. */
@Injectable()
export class BrandingRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** Null when no agency has this id. */
  async find(agencyId: string): Promise<BrandingRow | null> {
    const [row] = await this.db
      .select({
        agencyId: agencies.id,
        nameAr: agencies.nameAr,
        nameEn: agencies.nameEn,
        marketingName: agencyBranding.marketingName,
        primaryColor: agencyBranding.primaryColor,
        secondaryColor: agencyBranding.secondaryColor,
        phone: agencyBranding.phone,
        email: agencyBranding.email,
        website: agencyBranding.website,
        address: agencyBranding.address,
        orn: agencyBranding.orn,
        logoPath: agencyBranding.logoPath,
        updatedAt: agencyBranding.updatedAt,
      })
      .from(agencies)
      .leftJoin(agencyBranding, eq(agencyBranding.agencyId, agencies.id))
      .where(eq(agencies.id, agencyId));
    return row ?? null;
  }

  /** Creates the row or replaces every field but the logo. */
  async save(agencyId: string, fields: BrandingFields, now: Date): Promise<void> {
    await this.db
      .insert(agencyBranding)
      .values({ agencyId, ...fields })
      .onConflictDoUpdate({
        target: agencyBranding.agencyId,
        set: { ...fields, updatedAt: now },
      });
  }

  /**
   * Points the branding at a logo file, or at none. A missing row is created with the defaults
   * (the agency's English name as marketing name, the schema's colors). The file the row pointed at
   * before is left on disk: a catalog queued earlier may still use it (docs/decisions.md, P3.2).
   */
  async setLogo(agencyId: string, logoPath: string | null, now: Date): Promise<void> {
    await this.db
      .insert(agencyBranding)
      .values({
        agencyId,
        marketingName: sql`(SELECT ${agencies.nameEn} FROM ${agencies} WHERE ${agencies.id} = ${agencyId})`,
        logoPath,
      })
      .onConflictDoUpdate({
        target: agencyBranding.agencyId,
        set: { logoPath, updatedAt: now },
      });
  }
}
