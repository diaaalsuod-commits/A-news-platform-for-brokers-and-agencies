import { HttpStatus, Injectable } from '@nestjs/common';
import type {
  AmenityIconKey,
  CreateReferenceRequest,
  ReferenceItem,
  ReferenceKind,
  ReferenceListQuery,
  ReferenceListResponse,
  UpdateReferenceRequest,
} from '@reih/contracts';
import { isForeignKeyViolation, isUniqueViolation } from '../../../shared/database/index.js';
import { AppError } from '../../../shared/http/index.js';
import { REFERENCE_KINDS } from '../domain/reference-kinds.js';
import {
  ReferenceDataRepository,
  type ReferenceRow,
  type ReferenceValues,
} from '../infrastructure/reference-data.repository.js';

export function toReferenceItem(kind: ReferenceKind, row: ReferenceRow): ReferenceItem {
  return {
    id: row.id,
    kind,
    code: row.code,
    nameAr: row.nameAr,
    nameEn: row.nameEn,
    sortOrder: row.sortOrder,
    bedrooms: row.bedrooms,
    icon: row.icon as AmenityIconKey | null,
    categoryId: row.categoryId,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Only the fields the kind has; the request schema per kind already refused any other. */
function valuesFor(
  kind: ReferenceKind,
  input: UpdateReferenceRequest & { code?: string },
): ReferenceValues {
  const shape = REFERENCE_KINDS[kind];
  const values: ReferenceValues = {};
  if (shape.code && input.code !== undefined) values.code = input.code;
  if (input.nameAr !== undefined) values.nameAr = input.nameAr;
  if (input.nameEn !== undefined) values.nameEn = input.nameEn;
  if (shape.sortOrder && input.sortOrder !== undefined) values.sortOrder = input.sortOrder;
  if (shape.bedrooms && input.bedrooms !== undefined) values.bedrooms = input.bedrooms;
  if (shape.icon && input.icon !== undefined) values.icon = input.icon;
  if (shape.category && input.categoryId !== undefined) values.categoryId = input.categoryId;
  if (input.isActive !== undefined) values.isActive = input.isActive;
  return values;
}

const notFound = () => new AppError('NOT_FOUND', HttpStatus.NOT_FOUND);

/**
 * FR-ADM-04: the Platform Admin's reference data. An item in use cannot be deleted; it is
 * deactivated instead, and ReferenceDataReader leaves it out of new selections.
 */
@Injectable()
export class ReferenceDataService {
  constructor(private readonly repository: ReferenceDataRepository) {}

  async list(kind: ReferenceKind, query: ReferenceListQuery): Promise<ReferenceListResponse> {
    const { items, total } = await this.repository.list(kind, query);
    return {
      items: items.map((row) => toReferenceItem(kind, row)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(kind: ReferenceKind, id: string): Promise<ReferenceItem> {
    const row = await this.repository.findById(kind, id);
    if (!row) throw notFound();
    return toReferenceItem(kind, row);
  }

  async create(kind: ReferenceKind, input: CreateReferenceRequest): Promise<ReferenceItem> {
    if (REFERENCE_KINDS[kind].category) {
      await this.assertActiveCategory(input.categoryId);
    }
    const id = await this.write(() => this.repository.create(kind, valuesFor(kind, input)));
    return this.get(kind, id);
  }

  async update(
    kind: ReferenceKind,
    id: string,
    changes: UpdateReferenceRequest,
  ): Promise<ReferenceItem> {
    if (REFERENCE_KINDS[kind].category && changes.categoryId !== undefined) {
      await this.assertActiveCategory(changes.categoryId);
    }
    const found = await this.write(() =>
      this.repository.update(kind, id, valuesFor(kind, changes), new Date()),
    );
    if (!found) throw notFound();
    return this.get(kind, id);
  }

  /** An item in use answers REFERENCE_IN_USE; the database's foreign keys decide (migration 0003). */
  async delete(kind: ReferenceKind, id: string): Promise<void> {
    let deleted: boolean;
    try {
      deleted = await this.repository.delete(kind, id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new AppError('REFERENCE_IN_USE', HttpStatus.CONFLICT);
      }
      throw error;
    }
    if (!deleted) throw notFound();
  }

  /** A new or moved amenity needs an existing, active category. */
  private async assertActiveCategory(categoryId: string | undefined): Promise<void> {
    const category = categoryId
      ? await this.repository.findById('amenity-categories', categoryId)
      : null;
    if (!category) {
      throw new AppError('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, {
        issues: [{ path: 'categoryId', code: 'not_found' }],
      });
    }
    if (!category.isActive) {
      throw new AppError('AMENITY_CATEGORY_INACTIVE', HttpStatus.CONFLICT);
    }
  }

  private async write<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError('CODE_TAKEN', HttpStatus.CONFLICT);
      }
      throw error;
    }
  }
}
