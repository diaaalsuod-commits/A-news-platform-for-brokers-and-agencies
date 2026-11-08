import { Body, Controller, Delete, Get, Put, Req, Res, StreamableFile } from '@nestjs/common';
import {
  AGENCY_LOGO_MAX_BYTES,
  agencyLogoField,
  type Branding,
  type UpdateBrandingRequest,
  updateBrandingRequestSchema,
} from '@reih/contracts';
import type { Request, Response } from 'express';
import {
  CurrentUser,
  readSingleFile,
  type RequestUser,
  Roles,
  ZodValidationPipe,
} from '../../../shared/http/index.js';
import { AgencyService } from '../application/agency.service.js';
import { ownAgency } from './own-agency.js';

/**
 * FR-AGY-01, UC-04.1: the caller's own agency's branding. Brokers read it (catalogs and
 * presentation mode use it); only the Agency Admin changes it. @Roles('broker') also allows
 * agency_admin (FR-ACC-04).
 */
@Controller('agency/branding')
export class AgencyBrandingController {
  constructor(private readonly agencies: AgencyService) {}

  @Roles('broker')
  @Get()
  get(@CurrentUser() user: RequestUser): Promise<Branding> {
    return this.agencies.brandingOf(ownAgency(user));
  }

  @Roles('agency_admin')
  @Put()
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateBrandingRequestSchema)) body: UpdateBrandingRequest,
  ): Promise<Branding> {
    return this.agencies.updateBranding(ownAgency(user), body);
  }

  /** multipart/form-data with one file in the "logo" field, PNG or SVG up to 2 MB. */
  @Roles('agency_admin')
  @Put('logo')
  replaceLogo(@CurrentUser() user: RequestUser, @Req() request: Request): Promise<Branding> {
    const agencyId = ownAgency(user);
    return readSingleFile(
      request,
      { field: agencyLogoField, maxBytes: AGENCY_LOGO_MAX_BYTES },
      (file) => this.agencies.replaceLogo(agencyId, file),
    );
  }

  @Roles('agency_admin')
  @Delete('logo')
  removeLogo(@CurrentUser() user: RequestUser): Promise<Branding> {
    return this.agencies.removeLogo(ownAgency(user));
  }

  /** Behind the session, for members of the agency only; never cached by a shared cache. */
  @Roles('broker')
  @Get('logo')
  async logo(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { stream, headers } = await this.agencies.openLogo(ownAgency(user));
    response.set({ ...headers, 'Cache-Control': 'private' });
    return new StreamableFile(stream, { type: headers['Content-Type'] });
  }
}
