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
  type Area,
  type AreaListQuery,
  type AreaListResponse,
  areaListQuerySchema,
  type CreateAreaRequest,
  createAreaRequestSchema,
  idParamSchema,
  type UpdateAreaRequest,
  updateAreaRequestSchema,
} from '@reih/contracts';
import { Roles, ZodValidationPipe } from '../../../shared/http/index.js';
import { AreaService } from '../application/area.service.js';

const id = new ZodValidationPipe(idParamSchema);

/** FR-DAT-03, FR-LOC-04, UC-05.3: emirates and communities, all in the UAE. */
@Roles('data_operator')
@Controller('content/areas')
export class AreasController {
  constructor(private readonly areas: AreaService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(areaListQuerySchema)) query: AreaListQuery,
  ): Promise<AreaListResponse> {
    return this.areas.list(query);
  }

  /** The country is not part of the request: the server sets it to AE. */
  @Post()
  create(
    @Body(new ZodValidationPipe(createAreaRequestSchema)) body: CreateAreaRequest,
  ): Promise<Area> {
    return this.areas.create(body);
  }

  @Get(':id')
  get(@Param('id', id) areaId: string): Promise<Area> {
    return this.areas.get(areaId);
  }

  /** The level cannot change; isActive: false deactivates an area, one in use too. */
  @Patch(':id')
  update(
    @Param('id', id) areaId: string,
    @Body(new ZodValidationPipe(updateAreaRequestSchema)) body: UpdateAreaRequest,
  ): Promise<Area> {
    return this.areas.update(areaId, body);
  }

  /** An area in use is refused with AREA_IN_USE; deactivate it instead. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', id) areaId: string): Promise<void> {
    return this.areas.delete(areaId);
  }
}
