import { Inject, Injectable } from '@nestjs/common';
import type { RecordStatus } from '@reih/contracts';
import { and, asc, count, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { containsPattern, DATABASE } from '../../../shared/database/index.js';
import { developers } from './content.schema.js';

export interface DeveloperRow {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  website: string | null;
  logoPath: string | null;
  status: RecordStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeveloperValues {
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  website?: string | null;
  status?: RecordStatus;
}

const columns = {
  id: developers.id,
  nameAr: developers.nameAr,
  nameEn: developers.nameEn,
  descriptionAr: developers.descriptionAr,
  descriptionEn: developers.descriptionEn,
  website: developers.website,
  logoPath: developers.logoPath,
  status: developers.status,
  createdAt: developers.createdAt,
  updatedAt: developers.updatedAt,
};

/** FR-DAT-01: developers. */
@Injectable()
export class DeveloperRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** By English name, then id, so pages are stable. q matches either name. */
  async list(filter: {
    page: number;
    pageSize: number;
    q?: string;
    status?: RecordStatus;
  }): Promise<{ items: DeveloperRow[]; total: number }> {
    const conditions: (SQL | undefined)[] = [
      filter.status ? eq(developers.status, filter.status) : undefined,
      filter.q
        ? or(
            ilike(developers.nameEn, containsPattern(filter.q)),
            ilike(developers.nameAr, containsPattern(filter.q)),
          )
        : undefined,
    ];
    const where = and(...conditions);
    const [items, [totals]] = await Promise.all([
      this.db
        .select(columns)
        .from(developers)
        .where(where)
        .orderBy(asc(developers.nameEn), asc(developers.id))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(developers).where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  async findById(id: string): Promise<DeveloperRow | null> {
    const [row] = await this.db.select(columns).from(developers).where(eq(developers.id, id));
    return row ?? null;
  }

  async create(values: DeveloperValues & { nameAr: string; nameEn: string }): Promise<string> {
    const [row] = await this.db.insert(developers).values(values).returning({ id: developers.id });
    return (row as { id: string }).id;
  }

  /** Returns false when no developer has this id. */
  async update(id: string, values: DeveloperValues, now: Date): Promise<boolean> {
    const updated = await this.db
      .update(developers)
      .set({ ...values, updatedAt: now })
      .where(eq(developers.id, id))
      .returning({ id: developers.id });
    return updated.length > 0;
  }

  /**
   * Points the developer at a logo file, or at none; false when no developer has this id. The file
   * the row pointed at before is left on disk (docs/decisions.md, P3.2).
   */
  async setLogo(id: string, logoPath: string | null, now: Date): Promise<boolean> {
    const updated = await this.db
      .update(developers)
      .set({ logoPath, updatedAt: now })
      .where(eq(developers.id, id))
      .returning({ id: developers.id });
    return updated.length > 0;
  }

  /**
   * Returns false when no developer has this id. A developer in use fails on a foreign key (its
   * projects, its sales contacts, a broker's favorite); the caller turns it into DEVELOPER_IN_USE.
   */
  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(developers)
      .where(eq(developers.id, id))
      .returning({ id: developers.id });
    return deleted.length > 0;
  }
}
