import { Inject, Injectable } from '@nestjs/common';
import type { AgencyStatus } from '@reih/contracts';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { containsPattern, DATABASE } from '../../../shared/database/index.js';
import { agencies } from './agency.schema.js';

export interface AgencyRow {
  id: string;
  nameAr: string;
  nameEn: string;
  status: AgencyStatus;
}

export interface AgencyDetailRow extends AgencyRow {
  tradeLicenseNo: string;
  contactEmail: string;
  contactPhone: string;
  statusReason: string | null;
  statusChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgencyFields {
  nameAr: string;
  nameEn: string;
  tradeLicenseNo: string;
  contactEmail: string;
  contactPhone: string;
}

const detailColumns = {
  id: agencies.id,
  nameAr: agencies.nameAr,
  nameEn: agencies.nameEn,
  status: agencies.status,
  tradeLicenseNo: agencies.tradeLicenseNo,
  contactEmail: agencies.contactEmail,
  contactPhone: agencies.contactPhone,
  statusReason: agencies.statusReason,
  statusChangedAt: agencies.statusChangedAt,
  createdAt: agencies.createdAt,
  updatedAt: agencies.updatedAt,
};

@Injectable()
export class AgencyRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  async findById(agencyId: string): Promise<AgencyRow | null> {
    const [row] = await this.db
      .select({
        id: agencies.id,
        nameAr: agencies.nameAr,
        nameEn: agencies.nameEn,
        status: agencies.status,
      })
      .from(agencies)
      .where(eq(agencies.id, agencyId));
    return row ?? null;
  }

  async findDetail(agencyId: string): Promise<AgencyDetailRow | null> {
    const [row] = await this.db
      .select(detailColumns)
      .from(agencies)
      .where(eq(agencies.id, agencyId));
    return row ?? null;
  }

  /** By English name, then id, so pages are stable. q matches either name or the trade license. */
  async list(filter: {
    page: number;
    pageSize: number;
    q?: string;
    status?: AgencyStatus;
  }): Promise<{ items: AgencyDetailRow[]; total: number }> {
    const conditions: (SQL | undefined)[] = [
      filter.status ? eq(agencies.status, filter.status) : undefined,
      filter.q
        ? or(
            ilike(agencies.nameEn, containsPattern(filter.q)),
            ilike(agencies.nameAr, containsPattern(filter.q)),
            ilike(agencies.tradeLicenseNo, containsPattern(filter.q)),
          )
        : undefined,
    ];
    const where = and(...conditions);
    const [items, [totals]] = await Promise.all([
      this.db
        .select(detailColumns)
        .from(agencies)
        .where(where)
        .orderBy(asc(agencies.nameEn), asc(agencies.id))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(agencies).where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  /** A duplicate trade license number fails on the unique key; the caller turns it into 409. */
  async create(fields: AgencyFields, createdBy: string): Promise<string> {
    const [row] = await this.db
      .insert(agencies)
      .values({ ...fields, createdBy })
      .returning({ id: agencies.id });
    return (row as { id: string }).id;
  }

  /** Returns false when no agency has this id. */
  async update(agencyId: string, changes: Partial<AgencyFields>, now: Date): Promise<boolean> {
    const updated = await this.db
      .update(agencies)
      .set({ ...changes, updatedAt: now })
      .where(eq(agencies.id, agencyId))
      .returning({ id: agencies.id });
    return updated.length > 0;
  }

  /**
   * FR-ADM-02: one conditional UPDATE, so of two changes at once only one finds the status it
   * expects. Returns false when the agency is missing or not in the expected status.
   */
  async changeStatus(
    agencyId: string,
    from: AgencyStatus,
    to: AgencyStatus,
    reason: string,
    changedBy: string,
    now: Date,
  ): Promise<boolean> {
    const updated = await this.db
      .update(agencies)
      .set({
        status: to,
        statusReason: reason,
        statusChangedAt: now,
        statusChangedBy: changedBy,
        updatedAt: now,
      })
      .where(and(eq(agencies.id, agencyId), eq(agencies.status, from)))
      .returning({ id: agencies.id });
    return updated.length > 0;
  }
}
