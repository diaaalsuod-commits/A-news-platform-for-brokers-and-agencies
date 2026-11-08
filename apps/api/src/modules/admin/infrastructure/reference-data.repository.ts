import { Inject, Injectable } from '@nestjs/common';
import type { ReferenceKind } from '@reih/contracts';
import { and, asc, count, eq, ilike, inArray, or, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { containsPattern, DATABASE } from '../../../shared/database/index.js';
import { REFERENCE_KINDS } from '../domain/reference-kinds.js';
import {
  amenities,
  amenityCategories,
  furnishingTypes,
  layouts,
  propertyTypes,
  unitLevels,
  unitTags,
} from './admin.schema.js';

export interface ReferenceRow {
  id: string;
  code: string | null;
  nameAr: string;
  nameEn: string;
  sortOrder: number | null;
  bedrooms: number | null;
  icon: string | null;
  categoryId: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** The columns a kind may write; the service passes only the ones its kind has. */
export interface ReferenceValues {
  code?: string;
  nameAr?: string;
  nameEn?: string;
  sortOrder?: number;
  bedrooms?: number;
  icon?: string | null;
  categoryId?: string;
  isActive?: boolean;
}

const TABLES: Record<ReferenceKind, PgTable> = {
  'property-types': propertyTypes,
  layouts,
  'unit-levels': unitLevels,
  'furnishing-types': furnishingTypes,
  'unit-tags': unitTags,
  'amenity-categories': amenityCategories,
  amenities,
};

/**
 * The seven tables differ only in which optional columns they have, so one repository serves them
 * all. The columns are looked up by name in one place, below.
 */
function columnsOf(kind: ReferenceKind) {
  const table = TABLES[kind] as unknown as Record<string, PgColumn>;
  const shape = REFERENCE_KINDS[kind];
  const column = (name: string): PgColumn => table[name] as PgColumn;
  const selection: Record<string, PgColumn> = {
    id: column('id'),
    nameAr: column('nameAr'),
    nameEn: column('nameEn'),
    isActive: column('isActive'),
    createdAt: column('createdAt'),
    updatedAt: column('updatedAt'),
  };
  if (shape.code) selection.code = column('code');
  if (shape.sortOrder) selection.sortOrder = column('sortOrder');
  if (shape.bedrooms) selection.bedrooms = column('bedrooms');
  if (shape.icon) selection.icon = column('icon');
  if (shape.category) selection.categoryId = column('categoryId');
  return { table: TABLES[kind], selection, column, shape };
}

function toRow(row: Record<string, unknown>): ReferenceRow {
  return {
    id: row.id as string,
    code: (row.code as string | undefined) ?? null,
    nameAr: row.nameAr as string,
    nameEn: row.nameEn as string,
    sortOrder: (row.sortOrder as number | undefined) ?? null,
    bedrooms: (row.bedrooms as number | undefined) ?? null,
    icon: (row.icon as string | null | undefined) ?? null,
    categoryId: (row.categoryId as string | undefined) ?? null,
    isActive: row.isActive as boolean,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

/** FR-ADM-04: property types, layouts, unit levels, furnishing types, unit tags and amenities. */
@Injectable()
export class ReferenceDataRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** By sort order where the kind has one, then English name, then id, so pages are stable. */
  async list(
    kind: ReferenceKind,
    filter: { page: number; pageSize: number; q?: string; active?: boolean; categoryId?: string },
  ): Promise<{ items: ReferenceRow[]; total: number }> {
    const { table, selection, column, shape } = columnsOf(kind);
    const conditions: (SQL | undefined)[] = [
      filter.active === undefined ? undefined : eq(column('isActive'), filter.active),
      filter.categoryId && shape.category ? eq(column('categoryId'), filter.categoryId) : undefined,
      filter.q
        ? or(
            ilike(column('nameEn'), containsPattern(filter.q)),
            ilike(column('nameAr'), containsPattern(filter.q)),
            shape.code ? ilike(column('code'), containsPattern(filter.q)) : undefined,
          )
        : undefined,
    ];
    const where = and(...conditions);
    const order = [
      ...(shape.sortOrder ? [asc(column('sortOrder'))] : []),
      asc(column('nameEn')),
      asc(column('id')),
    ];
    const [items, [totals]] = await Promise.all([
      this.db
        .select(selection)
        .from(table)
        .where(where)
        .orderBy(...order)
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(table).where(where),
    ]);
    return { items: items.map(toRow), total: totals?.total ?? 0 };
  }

  async findById(kind: ReferenceKind, id: string): Promise<ReferenceRow | null> {
    const { table, selection, column } = columnsOf(kind);
    const [row] = await this.db
      .select(selection)
      .from(table)
      .where(eq(column('id'), id));
    return row ? toRow(row) : null;
  }

  /** A duplicate code fails on the unique key; the caller turns it into 409. */
  async create(kind: ReferenceKind, values: ReferenceValues): Promise<string> {
    const { table, column } = columnsOf(kind);
    const [row] = await this.db
      .insert(table)
      .values(values as never)
      .returning({ id: column('id') });
    return (row as { id: string }).id;
  }

  /** Returns false when no item has this id. */
  async update(
    kind: ReferenceKind,
    id: string,
    values: ReferenceValues,
    now: Date,
  ): Promise<boolean> {
    const { table, column } = columnsOf(kind);
    const updated = await this.db
      .update(table)
      .set({ ...values, updatedAt: now } as never)
      .where(eq(column('id'), id))
      .returning({ id: column('id') });
    return updated.length > 0;
  }

  /**
   * Returns false when no item has this id. An item in use fails on a foreign key (units, the
   * project and unit links, an amenity's category); the caller turns it into REFERENCE_IN_USE.
   */
  async delete(kind: ReferenceKind, id: string): Promise<boolean> {
    const { table, column } = columnsOf(kind);
    const deleted = await this.db
      .delete(table)
      .where(eq(column('id'), id))
      .returning({ id: column('id') });
    return deleted.length > 0;
  }

  /**
   * FR-ADM-04: the items new selections may offer. An amenity is offered only while its category
   * is active too. ids, when given, limits the result to those items.
   */
  async selectable(kind: ReferenceKind, ids?: string[]): Promise<ReferenceRow[]> {
    const { table, selection, column, shape } = columnsOf(kind);
    const byId = ids ? inArray(column('id'), ids) : undefined;
    const order = [
      ...(shape.sortOrder ? [asc(column('sortOrder'))] : []),
      asc(column('nameEn')),
      asc(column('id')),
    ];
    if (kind === 'amenities') {
      const rows = await this.db
        .select(selection)
        .from(amenities)
        .innerJoin(amenityCategories, eq(amenityCategories.id, amenities.categoryId))
        .where(and(eq(amenities.isActive, true), eq(amenityCategories.isActive, true), byId))
        .orderBy(asc(amenityCategories.sortOrder), ...order);
      return rows.map(toRow);
    }
    const rows = await this.db
      .select(selection)
      .from(table)
      .where(and(eq(column('isActive'), true), byId))
      .orderBy(...order);
    return rows.map(toRow);
  }
}
