import { Injectable } from '@nestjs/common';
import type { ReferenceItem, ReferenceKind } from '@reih/contracts';
import { ReferenceDataRepository } from '../infrastructure/reference-data.repository.js';
import { toReferenceItem } from './reference-data.service.js';

/**
 * FR-ADM-04: what new selections may offer, for the content module's forms (FR-DAT-04, FR-DAT-08).
 * A deactivated item is left out, and so is an amenity whose category is deactivated; items already
 * chosen keep their link.
 */
@Injectable()
export class ReferenceDataReader {
  constructor(private readonly repository: ReferenceDataRepository) {}

  async listActive(kind: ReferenceKind): Promise<ReferenceItem[]> {
    const rows = await this.repository.selectable(kind);
    return rows.map((row) => toReferenceItem(kind, row));
  }

  /** True when every id names an item that new selections may offer. */
  async areActive(kind: ReferenceKind, ids: readonly string[]): Promise<boolean> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return true;
    const rows = await this.repository.selectable(kind, unique);
    return rows.length === unique.length;
  }
}
