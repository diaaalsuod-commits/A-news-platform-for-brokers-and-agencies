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
  type CreateUnitRequest,
  createUnitRequestSchema,
  idParamSchema,
  type UnitDetail,
  type UnitListQuery,
  unitListQuerySchema,
  type UnitListResponse,
  type UpdateUnitRequest,
  updateUnitRequestSchema,
} from '@reih/contracts';
import {
  CurrentUser,
  type RequestUser,
  Roles,
  ZodValidationPipe,
} from '../../../shared/http/index.js';
import { UnitService } from '../application/unit.service.js';

const id = new ZodValidationPipe(idParamSchema);

/**
 * FR-DAT-08, FR-DAT-09, UC-05.9: a project's units. Content is global, so nothing is scoped to an
 * agency. The UC-05.9 sequence diagram shows /api/v1/projects/{pid}/units/{uid}; the path follows
 * the content endpoints instead (docs/decisions.md, P4.2).
 */
@Roles('data_operator')
@Controller('content/projects/:projectId/units')
export class UnitsController {
  constructor(private readonly units: UnitService) {}

  @Get()
  list(
    @Param('projectId', id) projectId: string,
    @Query(new ZodValidationPipe(unitListQuerySchema)) query: UnitListQuery,
  ): Promise<UnitListResponse> {
    return this.units.list(projectId, query);
  }

  @Post()
  create(
    @Param('projectId', id) projectId: string,
    @Body(new ZodValidationPipe(createUnitRequestSchema)) body: CreateUnitRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<UnitDetail> {
    return this.units.create(projectId, body, user.id);
  }

  @Get(':unitId')
  get(
    @Param('projectId', id) projectId: string,
    @Param('unitId', id) unitId: string,
  ): Promise<UnitDetail> {
    return this.units.get(projectId, unitId);
  }

  @Patch(':unitId')
  update(
    @Param('projectId', id) projectId: string,
    @Param('unitId', id) unitId: string,
    @Body(new ZodValidationPipe(updateUnitRequestSchema)) body: UpdateUnitRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<UnitDetail> {
    return this.units.update(projectId, unitId, body, user.id);
  }

  /** Only a unit of a never-published project without history (409 UNIT_IN_USE otherwise). */
  @Delete(':unitId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param('projectId', id) projectId: string,
    @Param('unitId', id) unitId: string,
  ): Promise<void> {
    return this.units.delete(projectId, unitId);
  }
}
