import type { ReadStream } from 'node:fs';
import type { Readable } from 'node:stream';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type Agency,
  AGENCY_LOGO_MAX_BYTES,
  type AgencyListQuery,
  type AgencyListResponse,
  type Branding,
  type CreateAgencyRequest,
  type MeAgency,
  type UpdateAgencyRequest,
  type UpdateBrandingRequest,
} from '@reih/contracts';
import { isUniqueViolation } from '../../../shared/database/index.js';
import { AgencySuspended, EventBus } from '../../../shared/events/index.js';
import { downloadHeaders, FileStorage } from '../../../shared/files/index.js';
import { AppError } from '../../../shared/http/index.js';
import {
  AGENCY_TRANSITIONS,
  type AgencyStatusAction,
  statusReason,
} from '../domain/agency-status.js';
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  LOGO_DIRECTORY,
  logoUrl,
  normaliseColor,
} from '../domain/branding.js';
import { type AgencyDetailRow, AgencyRepository } from '../infrastructure/agency.repository.js';
import { BrandingRepository, type BrandingRow } from '../infrastructure/branding.repository.js';

function toAgency(row: AgencyDetailRow): Agency {
  return {
    id: row.id,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    tradeLicenseNo: row.tradeLicenseNo,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    status: row.status,
    statusReason: row.statusReason,
    statusChangedAt: row.statusChangedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const notFound = () => new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);
const licenseTaken = () => new AppError('TRADE_LICENSE_TAKEN', HttpStatus.CONFLICT);

/**
 * The agency module's public service. Other modules reach agencies only through it (rule 2).
 *
 * It must never depend on an identity provider: identity's AgencyStatusPort is bound to it
 * (src/identity-ports.module.ts), so such a dependency would be a provider cycle.
 */
@Injectable()
export class AgencyService {
  constructor(
    private readonly agencies: AgencyRepository,
    private readonly branding: BrandingRepository,
    private readonly files: FileStorage,
    private readonly events: EventBus,
  ) {}

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

  /** FR-ADM-01. */
  async list(query: AgencyListQuery): Promise<AgencyListResponse> {
    const { items, total } = await this.agencies.list(query);
    return { items: items.map(toAgency), total, page: query.page, pageSize: query.pageSize };
  }

  /** FR-ADM-01. */
  async get(agencyId: string): Promise<Agency> {
    const row = await this.agencies.findDetail(agencyId);
    if (!row) throw notFound();
    return toAgency(row);
  }

  /** FR-ADM-01: a new agency starts active. The trade license number is unique. */
  async create(input: CreateAgencyRequest, createdBy: string): Promise<Agency> {
    let id: string;
    try {
      id = await this.agencies.create(input, createdBy);
    } catch (error) {
      if (isUniqueViolation(error)) throw licenseTaken();
      throw error;
    }
    return this.get(id);
  }

  /** FR-ADM-01. Only the fields sent change. */
  async update(agencyId: string, changes: UpdateAgencyRequest): Promise<Agency> {
    let found: boolean;
    try {
      found = await this.agencies.update(agencyId, changes, new Date());
    } catch (error) {
      if (isUniqueViolation(error)) throw licenseTaken();
      throw error;
    }
    if (!found) throw notFound();
    return this.get(agencyId);
  }

  /**
   * FR-ADM-02, BR-13: stores the reason, the admin and the time, then publishes AgencySuspended,
   * whose listener ends every member session. Login already refuses members of a suspended
   * agency. The agency's data is kept.
   */
  async suspend(agencyId: string, reason: string, by: string): Promise<Agency> {
    const agency = await this.changeStatus('suspend', agencyId, reason, by);
    await this.events.publish(new AgencySuspended(agencyId));
    return agency;
  }

  /** FR-ADM-02: the same flow with a reason; sessions are not touched. */
  reactivate(agencyId: string, reason: string, by: string): Promise<Agency> {
    return this.changeStatus('reactivate', agencyId, reason, by);
  }

  private async changeStatus(
    action: AgencyStatusAction,
    agencyId: string,
    reason: string,
    by: string,
  ): Promise<Agency> {
    const trimmed = statusReason(reason);
    if (trimmed === null) {
      throw new AppError('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, {
        issues: [{ path: 'reason', code: 'too_small' }],
      });
    }
    const { from, to, alreadyCode } = AGENCY_TRANSITIONS[action];
    const changed = await this.agencies.changeStatus(agencyId, from, to, trimmed, by, new Date());
    if (!changed) {
      const current = await this.agencies.findById(agencyId);
      if (!current) throw notFound();
      throw new AppError(alreadyCode, HttpStatus.CONFLICT);
    }
    return this.get(agencyId);
  }

  // ---------------------------------------------------------------- branding (FR-AGY-01)

  /**
   * FR-AGY-01: what a catalog needs, read fresh on each call. Catalogs copy it when they are
   * generated (FR-CAT-06), so a later catalog uses new branding and an earlier PDF never changes.
   * Until the Agency Admin saves branding, the defaults apply (isDefault). Null for an unknown id.
   */
  async getBranding(agencyId: string): Promise<AgencyBrandingSnapshot | null> {
    const row = await this.branding.find(agencyId);
    return row ? toSnapshot(row) : null;
  }

  /** The caller's own agency's branding, as the API shows it. */
  async brandingOf(agencyId: string): Promise<Branding> {
    const snapshot = await this.getBranding(agencyId);
    if (!snapshot) throw notFound();
    return {
      marketingName: snapshot.marketingName,
      primaryColor: snapshot.primaryColor,
      secondaryColor: snapshot.secondaryColor,
      phone: snapshot.phone,
      email: snapshot.email,
      website: snapshot.website,
      address: snapshot.address,
      orn: snapshot.orn,
      logoUrl: logoUrl(snapshot.logoKey),
      isDefault: snapshot.isDefault,
      updatedAt: snapshot.updatedAt,
    };
  }

  /** FR-AGY-01: every field at once; colors are stored upper-case. */
  async updateBranding(agencyId: string, input: UpdateBrandingRequest): Promise<Branding> {
    await this.branding.save(
      agencyId,
      {
        ...input,
        primaryColor: normaliseColor(input.primaryColor),
        secondaryColor: normaliseColor(input.secondaryColor),
      },
      new Date(),
    );
    return this.brandingOf(agencyId);
  }

  /**
   * FR-AGY-01: PNG or SVG up to 2 MB, judged by its bytes while it streams; an SVG is sanitized.
   * Each logo gets a new file. The previous file stays on disk, since a catalog queued earlier may
   * still use it; the new file is removed if the row cannot be updated.
   */
  async replaceLogo(agencyId: string, source: Readable): Promise<Branding> {
    const stored = await this.files.save(source, {
      directory: LOGO_DIRECTORY,
      maxBytes: AGENCY_LOGO_MAX_BYTES,
      allowed: ['png', 'svg'],
    });
    try {
      await this.branding.setLogo(agencyId, stored.key, new Date());
    } catch (error) {
      await this.files.remove(stored.key);
      throw error;
    }
    return this.brandingOf(agencyId);
  }

  /** Only the row changes; the file stays for catalogs queued earlier. */
  async removeLogo(agencyId: string): Promise<Branding> {
    const current = await this.branding.find(agencyId);
    if (current?.logoPath) {
      await this.branding.setLogo(agencyId, null, new Date());
    }
    return this.brandingOf(agencyId);
  }

  /** The agency's logo with the headers every download carries (nosniff, and a CSP for SVG). */
  async openLogo(
    agencyId: string,
  ): Promise<{ stream: ReadStream; headers: Record<string, string> }> {
    const key = (await this.branding.find(agencyId))?.logoPath;
    if (!key) throw notFound();
    const stream = this.files.openRead(key);
    await new Promise<void>((resolve, reject) => {
      stream.once('open', () => resolve());
      stream.once('error', () => reject(notFound()));
    });
    return { stream, headers: downloadHeaders(key) };
  }
}

/** FR-AGY-01: the branding a catalog copies at generation time (FR-CAT-04, FR-CAT-06). */
export interface AgencyBrandingSnapshot {
  agencyId: string;
  nameAr: string;
  nameEn: string;
  marketingName: string;
  primaryColor: string;
  secondaryColor: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  orn: string | null;
  /** The logo's key under FILES_DIR (FileStorage.openRead), or null. */
  logoKey: string | null;
  isDefault: boolean;
  updatedAt: string | null;
}

function toSnapshot(row: BrandingRow): AgencyBrandingSnapshot {
  return {
    agencyId: row.agencyId,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    marketingName: row.marketingName ?? row.nameEn,
    primaryColor: row.primaryColor ?? DEFAULT_PRIMARY_COLOR,
    secondaryColor: row.secondaryColor ?? DEFAULT_SECONDARY_COLOR,
    phone: row.phone,
    email: row.email,
    website: row.website,
    address: row.address,
    orn: row.orn,
    logoKey: row.logoPath,
    isDefault: row.marketingName === null,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}
