import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  Agency,
  AgencyListQuery,
  AgencyListResponse,
  CreateAgencyRequest,
  MeAgency,
  UpdateAgencyRequest,
} from '@reih/contracts';
import { isUniqueViolation } from '../../../shared/database/index.js';
import { AgencySuspended, EventBus } from '../../../shared/events/index.js';
import { AppError } from '../../../shared/http/index.js';
import {
  AGENCY_TRANSITIONS,
  type AgencyStatusAction,
  statusReason,
} from '../domain/agency-status.js';
import { type AgencyDetailRow, AgencyRepository } from '../infrastructure/agency.repository.js';

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
}
