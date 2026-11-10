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
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  type CreateDeveloperRequest,
  createDeveloperRequestSchema,
  type Developer,
  DEVELOPER_LOGO_MAX_BYTES,
  type DeveloperListQuery,
  type DeveloperListResponse,
  developerListQuerySchema,
  developerLogoField,
  idParamSchema,
  type UpdateDeveloperRequest,
  updateDeveloperRequestSchema,
} from '@reih/contracts';
import type { Request, Response } from 'express';
import { readSingleFile, Roles, ZodValidationPipe } from '../../../shared/http/index.js';
import { DeveloperService } from '../application/developer.service.js';

const id = new ZodValidationPipe(idParamSchema);

/** FR-DAT-01, UC-05.1: developers. Content is global, so nothing here is scoped to an agency. */
@Roles('data_operator')
@Controller('content/developers')
export class DevelopersController {
  constructor(private readonly developers: DeveloperService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(developerListQuerySchema)) query: DeveloperListQuery,
  ): Promise<DeveloperListResponse> {
    return this.developers.list(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createDeveloperRequestSchema)) body: CreateDeveloperRequest,
  ): Promise<Developer> {
    return this.developers.create(body);
  }

  @Get(':id')
  get(@Param('id', id) developerId: string): Promise<Developer> {
    return this.developers.get(developerId);
  }

  /** status: "archived" archives the developer; "active" restores it. */
  @Patch(':id')
  update(
    @Param('id', id) developerId: string,
    @Body(new ZodValidationPipe(updateDeveloperRequestSchema)) body: UpdateDeveloperRequest,
  ): Promise<Developer> {
    return this.developers.update(developerId, body);
  }

  /** A developer in use is refused with DEVELOPER_IN_USE; archive it instead. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', id) developerId: string): Promise<void> {
    return this.developers.delete(developerId);
  }

  /** multipart/form-data with one file in the "logo" field, PNG or SVG up to 2 MB. */
  @Put(':id/logo')
  replaceLogo(@Param('id', id) developerId: string, @Req() request: Request): Promise<Developer> {
    return readSingleFile(
      request,
      { field: developerLogoField, maxBytes: DEVELOPER_LOGO_MAX_BYTES },
      (file) => this.developers.replaceLogo(developerId, file),
    );
  }

  @Delete(':id/logo')
  removeLogo(@Param('id', id) developerId: string): Promise<Developer> {
    return this.developers.removeLogo(developerId);
  }

  /** Behind the session, for Data Operators; never cached by a shared cache. */
  @Get(':id/logo')
  async logo(
    @Param('id', id) developerId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { stream, headers } = await this.developers.openLogo(developerId);
    response.set({ ...headers, 'Cache-Control': 'private' });
    return new StreamableFile(stream, { type: headers['Content-Type'] });
  }
}
