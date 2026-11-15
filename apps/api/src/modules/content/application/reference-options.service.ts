import { Injectable } from '@nestjs/common';
import type { ContentReferenceListResponse, ReferenceKind } from '@reih/contracts';
import { ReferenceDataReader } from '../../admin/index.js';

/**
 * FR-DAT-04, FR-DAT-08, FR-ADM-04: the reference options of the Data Operator's forms, through
 * admin's ReferenceDataReader (content reads no admin table). The items new selections may offer,
 * then the included ones that are not among them, so a record keeps the names it already has; those
 * come back with isActive false (see contentReferenceListResponseSchema).
 */
@Injectable()
export class ReferenceOptionsService {
  constructor(private readonly reference: ReferenceDataReader) {}

  async list(
    kind: ReferenceKind,
    include: readonly string[] = [],
  ): Promise<ContentReferenceListResponse> {
    const active = await this.reference.listActive(kind);
    const listed = new Set(active.map((item) => item.id));
    const missing = [...new Set(include)].filter((id) => !listed.has(id));
    const extra = missing.length > 0 ? await this.reference.findByIds(kind, missing) : [];
    return { items: [...active, ...extra] };
  }
}
