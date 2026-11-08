import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  type ChangeMemberRoleRequest,
  changeMemberRoleRequestSchema,
  type ChangeMemberStatusRequest,
  changeMemberStatusRequestSchema,
  idParamSchema,
  type Member,
  type MemberListQuery,
  type MemberListResponse,
  memberListQuerySchema,
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
 * FR-AGY-03, FR-AGY-04, UC-04.2, UC-04.6, UC-04.7: the members of the caller's own agency. A member
 * id of another agency answers 404, so its existence stays hidden.
 */
@Roles('agency_admin')
@Controller('agency/members')
export class AgencyMembersController {
  constructor(private readonly members: AgencyMembersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(memberListQuerySchema)) query: MemberListQuery,
    @CurrentUser() user: RequestUser,
  ): Promise<MemberListResponse> {
    return this.members.listMembers(user, query);
  }

  @Get(':id')
  get(@Param('id', id) memberId: string, @CurrentUser() user: RequestUser): Promise<Member> {
    return this.members.getMember(user, memberId);
  }

  /** Refused for oneself and when the agency would keep no active Agency Admin. */
  @Patch(':id/role')
  changeRole(
    @Param('id', id) memberId: string,
    @Body(new ZodValidationPipe(changeMemberRoleRequestSchema)) body: ChangeMemberRoleRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<Member> {
    return this.members.changeRole(user, memberId, body.role);
  }

  /** "deactivated" ends the member's sessions at once; "active" reactivates. */
  @Patch(':id/status')
  setStatus(
    @Param('id', id) memberId: string,
    @Body(new ZodValidationPipe(changeMemberStatusRequestSchema)) body: ChangeMemberStatusRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<Member> {
    return this.members.setStatus(user, memberId, body);
  }
}
