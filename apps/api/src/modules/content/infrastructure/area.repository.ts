import { Inject, Injectable } from '@nestjs/common';
import type { AreaLevel } from '@reih/contracts';
import { and, asc, count, eq, ilike, or, type SQL, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { containsPattern, DATABASE } from '../../../shared/database/index.js';
import { areas } from './content.schema.js';

export interface AreaRow {
  id: string;
  parentId: string | null;
  level: AreaLevel;
  countryCode: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  lng: number;
  lat: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AreaValues {
  parentId?: string;
  nameAr?: string;
  nameEn?: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  center?: { lng: number; lat: number };
  isActive?: boolean;
}

// node-postgres returns a geography value as hex EWKB, so the coordinates are read through PostGIS.
const columns = {
  id: areas.id,
  parentId: areas.parentId,
  level: areas.level,
  countryCode: areas.countryCode,
  nameAr: areas.nameAr,
  nameEn: areas.nameEn,
  descriptionAr: areas.descriptionAr,
  descriptionEn: areas.descriptionEn,
  lng: sql<number>`ST_X(${areas.center}::geometry)`.mapWith(Number),
  lat: sql<number>`ST_Y(${areas.center}::geometry)`.mapWith(Number),
  isActive: areas.isActive,
  createdAt: areas.createdAt,
  updatedAt: areas.updatedAt,
};

/** A geography point from bound parameters, never from text put together by hand. */
const pointOf = ({ lng, lat }: { lng: number; lat: number }) =>
  sql<string>`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;

function toColumns({ center, ...values }: AreaValues) {
  return { ...values, ...(center ? { center: pointOf(center) } : {}) };
}

/** FR-DAT-03, FR-LOC-04: emirates and their communities. */
@Injectable()
export class AreaRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** Emirates first, then by English name and id, so pages are stable. q matches either name. */
  async list(filter: {
    page: number;
    pageSize: number;
    q?: string;
    level?: AreaLevel;
    parentId?: string;
    active?: boolean;
  }): Promise<{ items: AreaRow[]; total: number }> {
    const conditions: (SQL | undefined)[] = [
      filter.level ? eq(areas.level, filter.level) : undefined,
      filter.parentId ? eq(areas.parentId, filter.parentId) : undefined,
      filter.active === undefined ? undefined : eq(areas.isActive, filter.active),
      filter.q
        ? or(
            ilike(areas.nameEn, containsPattern(filter.q)),
            ilike(areas.nameAr, containsPattern(filter.q)),
          )
        : undefined,
    ];
    const where = and(...conditions);
    const [items, [totals]] = await Promise.all([
      this.db
        .select(columns)
        .from(areas)
        .where(where)
        .orderBy(asc(areas.level), asc(areas.nameEn), asc(areas.id))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(areas).where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  async findById(id: string): Promise<AreaRow | null> {
    const [row] = await this.db.select(columns).from(areas).where(eq(areas.id, id));
    return row ?? null;
  }

  /**
   * FR-LOC-04: the country is written here and nowhere else, always the UAE. A parent that was
   * deleted in the meantime fails on the foreign key.
   */
  async create(
    values: AreaValues & {
      level: AreaLevel;
      nameAr: string;
      nameEn: string;
      center: { lng: number; lat: number };
    },
    countryCode: string,
  ): Promise<string> {
    const { center, ...rest } = values;
    const [row] = await this.db
      .insert(areas)
      .values({ ...rest, center: pointOf(center), countryCode })
      .returning({ id: areas.id });
    return (row as { id: string }).id;
  }

  /** Returns false when no area has this id. */
  async update(id: string, values: AreaValues, now: Date): Promise<boolean> {
    const updated = await this.db
      .update(areas)
      .set({ ...toColumns(values), updatedAt: now })
      .where(eq(areas.id, id))
      .returning({ id: areas.id });
    return updated.length > 0;
  }

  /**
   * Returns false when no area has this id. An emirate with communities and a community with
   * projects fail on a foreign key; the caller turns it into AREA_IN_USE.
   */
  async delete(id: string): Promise<boolean> {
    const deleted = await this.db.delete(areas).where(eq(areas.id, id)).returning({ id: areas.id });
    return deleted.length > 0;
  }
}
