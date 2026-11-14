import { Inject, Injectable } from '@nestjs/common';
import type { MediaType, UnitListQuery, UnitStatus } from '@reih/contracts';
import { and, asc, count, desc, eq, ilike, isNotNull, ne, sql, type SQL } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  containsPattern,
  DATABASE,
  type DatabaseTransaction,
} from '../../../shared/database/index.js';
import { mediaFiles, unitHistory, units, unitTagLinks } from './content.schema.js';

type Reader = NodePgDatabase | DatabaseTransaction;

/** The unit's own columns, as a locked transaction sees them. */
export interface UnitColumns {
  id: string;
  projectId: string;
  unitNumber: string;
  propertyTypeId: string;
  layoutId: string;
  unitLevelId: string | null;
  furnishingTypeId: string | null;
  bathrooms: number | null;
  internalAreaSqm: string;
  totalAreaSqm: string | null;
  floorLabel: string | null;
  floorSortKey: number | null;
  view: string | null;
  priceAed: string | null;
  status: UnitStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface UnitRow extends UnitColumns {
  tagIds: string[];
  floorPlanMediaId: string | null;
}

export interface UnitHistoryRow {
  field: 'price' | 'status';
  oldValue: string | null;
  newValue: string;
  changedBy: string;
  changedAt: Date;
}

/** The columns a create or an edit writes; a field left out stays as it is. */
export interface UnitValues {
  unitNumber?: string;
  propertyTypeId?: string;
  layoutId?: string;
  unitLevelId?: string | null;
  furnishingTypeId?: string | null;
  bathrooms?: number | null;
  internalAreaSqm?: string;
  totalAreaSqm?: string | null;
  floorLabel?: string | null;
  floorSortKey?: number | null;
  view?: string | null;
  priceAed?: string | null;
  status?: UnitStatus;
}

/** A media row a floor-plan link touches, locked FOR UPDATE. */
export interface FloorPlanCandidate {
  id: string;
  type: MediaType;
  unitId: string | null;
  sourceNote: string;
  licenseNote: string;
}

const unitColumns = {
  id: units.id,
  projectId: units.projectId,
  unitNumber: units.unitNumber,
  propertyTypeId: units.propertyTypeId,
  layoutId: units.layoutId,
  unitLevelId: units.unitLevelId,
  furnishingTypeId: units.furnishingTypeId,
  bathrooms: units.bathrooms,
  internalAreaSqm: units.internalAreaSqm,
  totalAreaSqm: units.totalAreaSqm,
  floorLabel: units.floorLabel,
  floorSortKey: units.floorSortKey,
  view: units.view,
  priceAed: units.priceAed,
  status: units.status,
  createdAt: units.createdAt,
  updatedAt: units.updatedAt,
};

/** The unit's tag ids in one sub-select per row of the same statement (unit_tag_links_pkey). */
const tagIdsColumn = sql<string[]>`coalesce((
  SELECT array_agg(l.unit_tag_id::text ORDER BY l.unit_tag_id)
  FROM ${unitTagLinks} l WHERE l.unit_id = ${units.id}), '{}'::text[])`;

/** FR-DAT-08, FR-DAT-09: units, their tags, their floor-plan link and their history. */
@Injectable()
export class UnitRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  // ---------------------------------------------------------------- reads

  /**
   * NFR-03: one statement for the page and one for the total, whatever the number of units; the
   * tags come from a sub-select and the floor plans from one scan of the project's media.
   */
  async list(
    projectId: string,
    query: UnitListQuery,
  ): Promise<{ items: UnitRow[]; total: number }> {
    const where = and(
      eq(units.projectId, projectId),
      query.status ? eq(units.status, query.status) : undefined,
      query.layoutId ? eq(units.layoutId, query.layoutId) : undefined,
      query.propertyTypeId ? eq(units.propertyTypeId, query.propertyTypeId) : undefined,
      query.q ? ilike(units.unitNumber, containsPattern(query.q)) : undefined,
    );
    const [items, [totals]] = await Promise.all([
      this.selectUnits(this.db, projectId)
        .where(where)
        .orderBy(...orderOf(query))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.db.select({ total: count() }).from(units).where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  /** One unit of this project with its tags and floor plan, or null; another project's is not found. */
  async find(projectId: string, unitId: string, tx: Reader = this.db): Promise<UnitRow | null> {
    const [row] = await this.selectUnits(tx, projectId).where(
      and(eq(units.id, unitId), eq(units.projectId, projectId)),
    );
    return row ?? null;
  }

  /** FR-DAT-09: newest first; a price and a status change of one update share their time. */
  async history(unitId: string, tx: Reader = this.db): Promise<UnitHistoryRow[]> {
    return tx
      .select({
        field: unitHistory.field,
        oldValue: unitHistory.oldValue,
        newValue: unitHistory.newValue,
        changedBy: unitHistory.changedBy,
        changedAt: unitHistory.changedAt,
      })
      .from(unitHistory)
      .where(eq(unitHistory.unitId, unitId))
      .orderBy(desc(unitHistory.changedAt), asc(unitHistory.field), asc(unitHistory.id));
  }

  private selectUnits(reader: Reader, projectId: string) {
    const floorPlan = reader
      .selectDistinctOn([mediaFiles.unitId], {
        unitId: sql<string>`${mediaFiles.unitId}`.as('fp_unit_id'),
        mediaId: sql<string>`${mediaFiles.id}`.as('fp_media_id'),
      })
      .from(mediaFiles)
      .where(
        and(
          eq(mediaFiles.projectId, projectId),
          eq(mediaFiles.type, 'floor_plan'),
          isNotNull(mediaFiles.unitId),
        ),
      )
      .orderBy(mediaFiles.unitId, mediaFiles.id)
      .as('floor_plan');
    return reader
      .select({ ...unitColumns, tagIds: tagIdsColumn, floorPlanMediaId: floorPlan.mediaId })
      .from(units)
      .leftJoin(floorPlan, eq(floorPlan.unitId, units.id));
  }

  // ---------------------------------------------------------------- writes, in one transaction

  /**
   * The unit, locked FOR UPDATE, after its project row (lock order, docs/decisions.md P4.3).
   * Null when this project has no such unit.
   */
  async lock(tx: DatabaseTransaction, projectId: string, unitId: string) {
    const [row] = await tx
      .select(unitColumns)
      .from(units)
      .where(and(eq(units.id, unitId), eq(units.projectId, projectId)))
      .for('update');
    return row ?? null;
  }

  async tagIds(tx: DatabaseTransaction, unitId: string): Promise<string[]> {
    const rows = await tx
      .select({ id: unitTagLinks.unitTagId })
      .from(unitTagLinks)
      .where(eq(unitTagLinks.unitId, unitId));
    return rows.map((row) => row.id);
  }

  async historyRows(tx: DatabaseTransaction, unitId: string): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(unitHistory)
      .where(eq(unitHistory.unitId, unitId));
    return row?.n ?? 0;
  }

  async insert(
    tx: DatabaseTransaction,
    values: UnitValues & {
      projectId: string;
      unitNumber: string;
      propertyTypeId: string;
      layoutId: string;
      internalAreaSqm: string;
    },
  ): Promise<string> {
    const [row] = await tx.insert(units).values(values).returning({ id: units.id });
    return (row as { id: string }).id;
  }

  /** FR-DAT-09: the units_history trigger records a change of price or status in this statement. */
  async update(
    tx: DatabaseTransaction,
    unitId: string,
    values: UnitValues,
    now: Date,
  ): Promise<void> {
    await tx
      .update(units)
      .set({ ...values, updatedAt: now })
      .where(eq(units.id, unitId));
  }

  async replaceTags(tx: DatabaseTransaction, unitId: string, tagIds: readonly string[]) {
    await tx.delete(unitTagLinks).where(eq(unitTagLinks.unitId, unitId));
    if (tagIds.length > 0) {
      await tx.insert(unitTagLinks).values(tagIds.map((unitTagId) => ({ unitId, unitTagId })));
    }
  }

  /**
   * The media rows a floor-plan change touches, locked FOR UPDATE in ascending id (lock order,
   * P4.3): the one to link, if any, and those linked to the unit now.
   */
  async lockFloorPlans(
    tx: DatabaseTransaction,
    projectId: string,
    unitId: string,
    mediaId: string | null,
  ): Promise<FloorPlanCandidate[]> {
    const touched = mediaId
      ? sql`(${mediaFiles.id} = ${mediaId} OR ${mediaFiles.unitId} = ${unitId})`
      : eq(mediaFiles.unitId, unitId);
    return tx
      .select({
        id: mediaFiles.id,
        type: mediaFiles.type,
        unitId: mediaFiles.unitId,
        sourceNote: mediaFiles.sourceNote,
        licenseNote: mediaFiles.licenseNote,
      })
      .from(mediaFiles)
      .where(and(eq(mediaFiles.projectId, projectId), touched))
      .orderBy(asc(mediaFiles.id))
      .for('update');
  }

  /** Links this media row to the unit as its only floor plan, or unlinks the unit's floor plan. */
  async linkFloorPlan(
    tx: DatabaseTransaction,
    unitId: string,
    mediaId: string | null,
  ): Promise<void> {
    await tx
      .update(mediaFiles)
      .set({ unitId: null })
      .where(and(eq(mediaFiles.unitId, unitId), mediaId ? ne(mediaFiles.id, mediaId) : undefined));
    if (mediaId) {
      await tx.update(mediaFiles).set({ unitId }).where(eq(mediaFiles.id, mediaId));
    }
  }

  /** Q5 of P4.3: the floor plan is unlinked and the tag links go with the unit (ON DELETE CASCADE). */
  async delete(tx: DatabaseTransaction, unitId: string): Promise<void> {
    await tx.update(mediaFiles).set({ unitId: null }).where(eq(mediaFiles.unitId, unitId));
    await tx.delete(units).where(eq(units.id, unitId));
  }
}

/** Units without a floor or a price come last in both directions; ties by unit number, then id. */
function orderOf(query: UnitListQuery): SQL[] {
  const direction = query.order === 'desc' ? sql`DESC` : sql`ASC`;
  const byNumber = sql`${units.unitNumber} ${direction}`;
  const byId = asc(units.id);
  switch (query.sort) {
    case 'price':
      return [sql`${units.priceAed} ${direction} NULLS LAST`, byNumber, byId];
    case 'unitNumber':
      return [byNumber, byId];
    case 'floor':
      return [sql`${units.floorSortKey} ${direction} NULLS LAST`, byNumber, byId];
  }
}
