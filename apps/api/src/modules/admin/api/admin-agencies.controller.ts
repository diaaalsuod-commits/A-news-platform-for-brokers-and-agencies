import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type Agency,
  type AgencyListQuery,
  type AgencyListResponse,
  agencyListQuerySchema,
  type AgencyStatusChangeRequest,
  agencyStatusChangeRequestSchema,
  type CreateAgencyRequest,
  createAgencyRequestSchema,
  idParamSchema,
  type InvitationListResponse,
  type InviteAgencyAdminRequest,
  inviteAgencyAdminRequestSchema,
  type InviteResponse,
  type PageQuery,
  pageQuerySchema,
  type UpdateAgencyRequest,
  updateAgencyRequestSchema,
} from '@reih/contracts';
import { AgencyService } from '../../agency/index.js';
import { UserDirectory } from '../../identity/index.js';
import {
  CurrentUser,
  type RequestUser,
  Roles,
  ZodValidationPipe,
} from '../../../shared/http/index.js';
import { AgencyOnboardingService } from '../application/agency-onboarding.service.js';

const id = new ZodValidationPipe(idParamSchema);

/** FR-ADM-01, FR-ADM-02, UC-06.1, UC-06.2. The agencies table belongs to agency (AgencyService). */
@Roles('platform_admin')
@Controller('admin/agencies')
export class AdminAgenciesController {
  constructor(
    private readonly agencies: AgencyService,
    private readonly onboarding: AgencyOnboardingService,
    private readonly directory: UserDirectory,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(agencyListQuerySchema)) query: AgencyListQuery,
  ): Promise<AgencyListResponse> {
    return this.agencies.list(query);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createAgencyRequestSchema)) body: CreateAgencyRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<Agency> {
    return this.agencies.create(body, user.id);
  }

  @Get(':id')
  get(@Param('id', id) agencyId: string): Promise<Agency> {
    return this.agencies.get(agencyId);
  }

  @Patch(':id')
  update(
    @Param('id', id) agencyId: string,
    @Body(new ZodValidationPipe(updateAgencyRequestSchema)) body: UpdateAgencyRequest,
  ): Promise<Agency> {
    return this.agencies.update(agencyId, body);
  }

  /** FR-ADM-02, BR-13: a mandatory reason; members' sessions end. */
  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @Param('id', id) agencyId: string,
    @Body(new ZodValidationPipe(agencyStatusChangeRequestSchema)) body: AgencyStatusChangeRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<Agency> {
    return this.agencies.suspend(agencyId, body.reason, user.id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('id', id) agencyId: string,
    @Body(new ZodValidationPipe(agencyStatusChangeRequestSchema)) body: AgencyStatusChangeRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<Agency> {
    return this.agencies.reactivate(agencyId, body.reason, user.id);
  }

  /** FR-ADM-01: the agency's open Agency Admin invitations, to resend or cancel them. */
  @Get(':id/invitations')
  async invitations(
    @Param('id', id) agencyId: string,
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
    @CurrentUser() user: RequestUser,
  ): Promise<InvitationListResponse> {
    await this.agencies.get(agencyId);
    return this.directory.listAgencyAdminInvitations(user, agencyId, query);
  }

  /** FR-ADM-01: invites the agency's (first) Agency Admin by email. */
  @Post(':id/invitations')
  invite(
    @Param('id', id) agencyId: string,
    @Body(new ZodValidationPipe(inviteAgencyAdminRequestSchema)) body: InviteAgencyAdminRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<InviteResponse> {
    return this.onboarding.inviteAgencyAdmin(user, agencyId, body);
  }
}
