import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  CreateUnitRequest,
  ReferenceKind,
  Unit,
  UnitDetail,
  UnitListQuery,
  UnitListResponse,
  UpdateUnitRequest,
} from '@reih/contracts';
import {
  DatabaseService,
  type DatabaseTransaction,
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../../shared/database/index.js';
import { AppError } from '../../../shared/http/index.js';
import { ReferenceDataReader } from '../../admin/index.js';
import { parseFloor } from '../domain/floor.js';
import { isLicensed } from '../domain/project.js';
import { areaIssue, priceIssue, unitDeleteAllowed } from '../domain/unit.js';
import { ProjectRepository } from '../infrastructure/project.repository.js';
import {
  type UnitHistoryRow,
  UnitRepository,
  type UnitRow,
  type UnitValues,
} from '../infrastructure/unit.repository.js';
import { assertNoIssue, notFound, validationFailed } from './errors.js';
import { projectArchived } from './project.service.js';

/** FR-DAT-08: the unique constraint, not a check before the insert, decides a duplicate. */
const UNIT_NUMBER_KEY = 'units_project_id_unit_number_key';

export const unitNumberTaken = () => new AppError('UNIT_NUMBER_TAKEN', HttpStatus.CONFLICT);
export const unitInUse = () => new AppError('UNIT_IN_USE', HttpStatus.CONFLICT);

function toUnit(row: UnitRow): Unit {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toHistory(row: UnitHistoryRow) {
  return { ...row, changedAt: row.changedAt.toISOString() };
}

/** The floor columns of a label: left out stays out, null clears both, an unknown label is 400. */
function floorColumns(
  label: string | null | undefined,
): Pick<UnitValues, 'floorLabel' | 'floorSortKey'> {
  if (label === undefined) return {};
  if (label === null) return { floorLabel: null, floorSortKey: null };
  const floor = parseFloor(label);
  if (!floor) throw validationFailed({ path: 'floorLabel', code: 'unknown' });
  return { floorLabel: floor.label, floorSortKey: floor.sortKey };
}

/** The columns of a request, without tagIds and floorPlanMediaId, which are not unit columns. */
function columnsOf({
  tagIds: _tagIds,
  floorPlanMediaId: _floorPlanMediaId,
  floorLabel,
  ...columns
}: UpdateUnitRequest): UnitValues {
  return {
    ...Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined)),
    ...floorColumns(floorLabel),
  } as UnitValues;
}

/** A selection that is new for the unit: the id when it changes to a non-null value, else none. */
const changedTo = (next: string | null | undefined, current: string | null) =>
  next !== undefined && next !== null && next !== current ? [next] : [];

/**
 * FR-DAT-08, FR-DAT-09, UC-05.9: a project's units. Every write runs inside
 * DatabaseService.withUser, so the units_history trigger records exactly one history row per
 * change of price or status with the acting user; outside withUser the trigger refuses the write.
 * Lock order (docs/decisions.md, P4.3): the project row FOR SHARE (an archive or a publish waits),
 * then the unit FOR UPDATE, then the floor-plan media rows in ascending id. Units are not publishing
 * blockers, so a published project's prices and statuses change freely.
 */
@Injectable()
export class UnitService {
  constructor(
    private readonly units: UnitRepository,
    private readonly projects: ProjectRepository,
    private readonly database: DatabaseService,
    private readonly referenceData: ReferenceDataReader,
  ) {}

  async list(projectId: string, query: UnitListQuery): Promise<UnitListResponse> {
    if (!(await this.projects.exists(projectId))) throw notFound();
    const { items, total } = await this.units.list(projectId, query);
    return { items: items.map(toUnit), total, page: query.page, pageSize: query.pageSize };
  }

  async get(projectId: string, unitId: string): Promise<UnitDetail> {
    const row = await this.units.find(projectId, unitId);
    if (!row) throw notFound();
    const history = await this.units.history(unitId);
    return { ...toUnit(row), history: history.map(toHistory) };
  }

  async create(projectId: string, input: CreateUnitRequest, userId: string): Promise<UnitDetail> {
    const status = input.status ?? 'available';
    const priceAed = input.priceAed ?? null;
    const totalAreaSqm = input.totalAreaSqm ?? null;
    const values = columnsOf(input);
    assertNoIssue(priceIssue({ status, priceAed }, null));
    assertNoIssue(areaIssue({ internalAreaSqm: input.internalAreaSqm, totalAreaSqm }));
    const tagIds = input.tagIds ?? [];
    await this.assertSelectable({
      'property-types': [input.propertyTypeId],
      layouts: [input.layoutId],
      'unit-levels': changedTo(input.unitLevelId, null),
      'furnishing-types': changedTo(input.furnishingTypeId, null),
      'unit-tags': tagIds,
    });

    const unitId = await this.saving(() =>
      this.database.withUser(userId, async (tx) => {
        await this.lockEditable(tx, projectId);
        const id = await this.units.insert(tx, {
          ...values,
          projectId,
          unitNumber: input.unitNumber,
          propertyTypeId: input.propertyTypeId,
          layoutId: input.layoutId,
          internalAreaSqm: input.internalAreaSqm,
          totalAreaSqm,
          priceAed,
          status,
        });
        await this.units.replaceTags(tx, id, tagIds);
        if (input.floorPlanMediaId) {
          await this.attachFloorPlan(tx, projectId, id, input.floorPlanMediaId);
        }
        return id;
      }),
    );
    return this.get(projectId, unitId);
  }

  /**
   * Only the fields sent change; tagIds, when sent, replaces the whole set. What is checked is the
   * unit as it will be. A deactivated reference item stays on a unit that has it, but is refused as
   * a new choice (FR-ADM-04).
   */
  async update(
    projectId: string,
    unitId: string,
    changes: UpdateUnitRequest,
    userId: string,
  ): Promise<UnitDetail> {
    const values = columnsOf(changes);
    await this.saving(() =>
      this.database.withUser(userId, async (tx) => {
        await this.lockEditable(tx, projectId);
        const current = await this.units.lock(tx, projectId, unitId);
        if (!current) throw notFound();

        assertNoIssue(
          priceIssue(
            {
              status: changes.status ?? current.status,
              priceAed: changes.priceAed === undefined ? current.priceAed : changes.priceAed,
            },
            current.priceAed,
          ),
        );
        assertNoIssue(
          areaIssue({
            internalAreaSqm: changes.internalAreaSqm ?? current.internalAreaSqm,
            totalAreaSqm:
              changes.totalAreaSqm === undefined ? current.totalAreaSqm : changes.totalAreaSqm,
          }),
        );
        const keptTags = new Set(await this.units.tagIds(tx, unitId));
        await this.assertSelectable({
          'property-types': changedTo(changes.propertyTypeId, current.propertyTypeId),
          layouts: changedTo(changes.layoutId, current.layoutId),
          'unit-levels': changedTo(changes.unitLevelId, current.unitLevelId),
          'furnishing-types': changedTo(changes.furnishingTypeId, current.furnishingTypeId),
          'unit-tags': (changes.tagIds ?? []).filter((id) => !keptTags.has(id)),
        });

        await this.units.update(tx, unitId, values, new Date());
        if (changes.tagIds !== undefined) await this.units.replaceTags(tx, unitId, changes.tagIds);
        if (changes.floorPlanMediaId !== undefined) {
          await this.attachFloorPlan(tx, projectId, unitId, changes.floorPlanMediaId);
        }
      }),
    );
    return this.get(projectId, unitId);
  }

  /**
   * Q5 of P4.3: only a unit of a project that was never published and without history is deleted,
   * with its floor plan unlinked in the same transaction; otherwise 409 UNIT_IN_USE. The project row
   * is locked FOR SHARE, so a publish cannot happen in between.
   */
  async delete(projectId: string, unitId: string): Promise<void> {
    try {
      await this.projects.transaction(async (tx) => {
        const project = await this.lockEditable(tx, projectId);
        if (!(await this.units.lock(tx, projectId, unitId))) throw notFound();
        const historyRows = await this.units.historyRows(tx, unitId);
        if (!unitDeleteAllowed({ projectPublishedAt: project.publishedAt, historyRows })) {
          throw unitInUse();
        }
        await this.units.delete(tx, unitId);
      });
    } catch (error) {
      // No catalog item or favorite can name a unit of a never-published project; kept as a guard.
      if (isForeignKeyViolation(error)) throw unitInUse();
      throw error;
    }
  }

  /** The project row FOR SHARE; unknown is 404 and archived is 409 PROJECT_ARCHIVED. */
  private async lockEditable(tx: DatabaseTransaction, projectId: string) {
    const project = await this.projects.lockState(tx, projectId, 'share');
    if (!project) throw notFound();
    if (project.status === 'archived') throw projectArchived();
    return project;
  }

  /**
   * Rule 6 of P4.3: the floor plan is a licensed floor_plan media file of the same project, linked
   * through media_files.unit_id, and belongs to one unit at a time; null unlinks the unit's floor
   * plan. The rows are locked FOR UPDATE, so two units never take the same file.
   */
  private async attachFloorPlan(
    tx: DatabaseTransaction,
    projectId: string,
    unitId: string,
    mediaId: string | null,
  ): Promise<void> {
    const rows = await this.units.lockFloorPlans(tx, projectId, unitId, mediaId);
    if (mediaId) {
      const media = rows.find((row) => row.id === mediaId);
      const refuse = (code: string) => validationFailed({ path: 'floorPlanMediaId', code });
      if (!media) throw refuse('not_found');
      if (media.type !== 'floor_plan') throw refuse('not_floor_plan');
      if (!isLicensed(media)) throw refuse('unlicensed');
      if (media.unitId !== null && media.unitId !== unitId) throw refuse('linked_to_other_unit');
    }
    await this.units.linkFloorPlan(tx, unitId, mediaId);
  }

  /** FR-ADM-04: every id must name an item that new selections may offer. */
  private async assertSelectable(selections: Partial<Record<ReferenceKind, string[]>>) {
    const paths: Partial<Record<ReferenceKind, string>> = {
      'property-types': 'propertyTypeId',
      layouts: 'layoutId',
      'unit-levels': 'unitLevelId',
      'furnishing-types': 'furnishingTypeId',
      'unit-tags': 'tagIds',
    };
    for (const [kind, ids] of Object.entries(selections) as [ReferenceKind, string[]][]) {
      if (!(await this.referenceData.areActive(kind, ids))) {
        throw validationFailed({ path: paths[kind] as string, code: 'inactive_or_unknown' });
      }
    }
  }

  /** 409 UNIT_NUMBER_TAKEN from units_project_id_unit_number_key. */
  private async saving<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isUniqueViolation(error, UNIT_NUMBER_KEY)) throw unitNumberTaken();
      throw error;
    }
  }
}
