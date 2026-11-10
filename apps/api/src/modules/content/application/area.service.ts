import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type Area,
  type AreaListQuery,
  type AreaListResponse,
  COUNTRY_CODE,
  type CreateAreaRequest,
  type UpdateAreaRequest,
} from '@reih/contracts';
import { isForeignKeyViolation } from '../../../shared/database/index.js';
import { AppError } from '../../../shared/http/index.js';
import { centerIssue, parentAreaIssue, parentIssue } from '../domain/area.js';
import { AreaRepository, type AreaRow } from '../infrastructure/area.repository.js';
import { assertNoIssue, defined, notFound, validationFailed } from './errors.js';

function toArea(row: AreaRow): Area {
  return {
    id: row.id,
    level: row.level,
    parentId: row.parentId,
    countryCode: COUNTRY_CODE,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    center: { lng: row.lng, lat: row.lat },
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * FR-DAT-03, FR-LOC-04: emirates and communities. Every area is in the UAE: the server writes the
 * country and no request can set it. An area's level never changes, so a community's parent, once
 * checked to be an emirate, stays one.
 */
@Injectable()
export class AreaService {
  constructor(private readonly areas: AreaRepository) {}

  async list(query: AreaListQuery): Promise<AreaListResponse> {
    const { items, total } = await this.areas.list(query);
    return { items: items.map(toArea), total, page: query.page, pageSize: query.pageSize };
  }

  async get(id: string): Promise<Area> {
    const row = await this.areas.findById(id);
    if (!row) throw notFound();
    return toArea(row);
  }

  async create(input: CreateAreaRequest): Promise<Area> {
    assertNoIssue(parentIssue(input.level, input.parentId));
    assertNoIssue(centerIssue(input.center));
    const parentId = input.level === 'community' ? (input.parentId as string) : undefined;
    if (parentId) await this.assertEmirate(parentId);

    const id = await this.refusingMissingParent(() =>
      this.areas.create(
        {
          level: input.level,
          parentId,
          nameAr: input.nameAr,
          nameEn: input.nameEn,
          descriptionAr: input.descriptionAr ?? null,
          descriptionEn: input.descriptionEn ?? null,
          center: input.center,
          isActive: input.isActive,
        },
        COUNTRY_CODE,
      ),
    );
    return this.get(id);
  }

  /** Only the fields sent change. A community may move to another emirate; an emirate has none. */
  async update(id: string, changes: UpdateAreaRequest): Promise<Area> {
    const current = await this.areas.findById(id);
    if (!current) throw notFound();
    if (changes.parentId !== undefined) {
      assertNoIssue(parentIssue(current.level, changes.parentId));
      await this.assertEmirate(changes.parentId);
    }
    if (changes.center !== undefined) {
      assertNoIssue(centerIssue(changes.center));
    }
    const found = await this.refusingMissingParent(() =>
      this.areas.update(id, defined(changes), new Date()),
    );
    if (!found) throw notFound();
    return this.get(id);
  }

  /**
   * The delete is attempted and the database's foreign keys decide: an emirate that has communities
   * and a community that has projects answer AREA_IN_USE. Deactivate such an area instead.
   */
  async delete(id: string): Promise<void> {
    let deleted: boolean;
    try {
      deleted = await this.areas.delete(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new AppError('AREA_IN_USE', HttpStatus.CONFLICT);
      }
      throw error;
    }
    if (!deleted) throw notFound();
  }

  /** FR-DAT-03: a community must belong to an emirate. */
  private async assertEmirate(parentId: string): Promise<void> {
    assertNoIssue(parentAreaIssue(await this.areas.findById(parentId)));
  }

  /** A parent deleted between the check and the write fails on the foreign key: the same answer. */
  private async refusingMissingParent<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw validationFailed({ path: 'parentId', code: 'not_found' });
      }
      throw error;
    }
  }
}
