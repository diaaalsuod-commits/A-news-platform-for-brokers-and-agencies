import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateReferenceRequest,
  createReferenceRequestSchemas,
  idParamSchema,
  type ReferenceItem,
  type ReferenceKind,
  referenceKindSchema,
  type ReferenceListQuery,
  type ReferenceListResponse,
  referenceListQuerySchema,
  type UpdateReferenceRequest,
  updateReferenceRequestSchemas,
} from '@reih/contracts';
import { Roles, ZodValidationPipe } from '../../../shared/http/index.js';
import { ReferenceDataService } from '../application/reference-data.service.js';

const id = new ZodValidationPipe(idParamSchema);
const kindPipe = new ZodValidationPipe(referenceKindSchema);

/**
 * FR-ADM-04, UC-06.4: property types, layouts, unit levels, furnishing types, unit tags, amenity
 * categories and amenities. The body is checked against the schema of the kind in the path.
 */
@Roles('platform_admin')
@Controller('admin/reference/:kind')
export class AdminReferenceController {
  constructor(private readonly reference: ReferenceDataService) {}

  @Get()
  list(
    @Param('kind', kindPipe) kind: ReferenceKind,
    @Query(new ZodValidationPipe(referenceListQuerySchema)) query: ReferenceListQuery,
  ): Promise<ReferenceListResponse> {
    return this.reference.list(kind, query);
  }

  @Post()
  create(
    @Param('kind', kindPipe) kind: ReferenceKind,
    @Body() body: unknown,
  ): Promise<ReferenceItem> {
    const input = new ZodValidationPipe(createReferenceRequestSchemas[kind]).transform(
      body,
    ) as CreateReferenceRequest;
    return this.reference.create(kind, input);
  }

  @Get(':id')
  get(
    @Param('kind', kindPipe) kind: ReferenceKind,
    @Param('id', id) itemId: string,
  ): Promise<ReferenceItem> {
    return this.reference.get(kind, itemId);
  }

  /** The code cannot change; isActive: false deactivates an item, for one in use too. */
  @Patch(':id')
  update(
    @Param('kind', kindPipe) kind: ReferenceKind,
    @Param('id', id) itemId: string,
    @Body() body: unknown,
  ): Promise<ReferenceItem> {
    const changes = new ZodValidationPipe(updateReferenceRequestSchemas[kind]).transform(
      body,
    ) as UpdateReferenceRequest;
    return this.reference.update(kind, itemId, changes);
  }

  /** An item in use is refused with REFERENCE_IN_USE; deactivate it instead. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('kind', kindPipe) kind: ReferenceKind,
    @Param('id', id) itemId: string,
  ): Promise<void> {
    return this.reference.delete(kind, itemId);
  }
}
