import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  type ContentReferenceListResponse,
  type ContentReferenceQuery,
  contentReferenceQuerySchema,
  type ReferenceKind,
  referenceKindSchema,
} from '@reih/contracts';
import { Roles, ZodValidationPipe } from '../../../shared/http/index.js';
import { ReferenceOptionsService } from '../application/reference-options.service.js';

/**
 * FR-DAT-04, FR-DAT-08, FR-ADM-04: the reference data the Data Operator's forms offer (property
 * types, layouts, unit levels, furnishing, unit tags, amenity categories, amenities). Not paged: an
 * exception to the list rule (docs/decisions.md, P4.4 part b).
 */
@Roles('data_operator')
@Controller('content/reference')
export class ReferenceController {
  constructor(private readonly options: ReferenceOptionsService) {}

  @Get(':kind')
  list(
    @Param('kind', new ZodValidationPipe(referenceKindSchema)) kind: ReferenceKind,
    @Query(new ZodValidationPipe(contentReferenceQuerySchema)) query: ContentReferenceQuery,
  ): Promise<ContentReferenceListResponse> {
    return this.options.list(kind, query.include);
  }
}
