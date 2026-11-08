import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import {
  idParamSchema,
  type InvitationListResponse,
  type InviteMemberRequest,
  inviteMemberRequestSchema,
  type InviteResponse,
  type PageQuery,
  pageQuerySchema,
} from '@reih/contracts';
import {
  CurrentUser,
  type RequestUser,
  Roles,
  ZodValidationPipe,
} from '../../../shared/http/index.js';
import { AgencyMembersService } from '../application/agency-members.service.js';

const id = new ZodValidationPipe(idParamSchema);

/**
 * FR-AGY-02, UC-04.3 to UC-04.5: invitations into the caller's own agency. Another agency's
 * invitation id answers 404.
 */
@Roles('agency_admin')
@Controller('agency/invitations')
export class AgencyInvitationsController {
  constructor(private readonly members: AgencyMembersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(pageQuerySchema)) query: PageQuery,
    @CurrentUser() user: RequestUser,
  ): Promise<InvitationListResponse> {
    return this.members.listInvitations(user, query);
  }

  @Post()
  invite(
    @Body(new ZodValidationPipe(inviteMemberRequestSchema)) body: InviteMemberRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<InviteResponse> {
    return this.members.invite(user, body);
  }

  /** A new link and a new expiry; the old link stops working. */
  @Post(':id/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  resend(@Param('id', id) invitationId: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.members.resend(user, invitationId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@Param('id', id) invitationId: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.members.cancel(user, invitationId);
  }
}
