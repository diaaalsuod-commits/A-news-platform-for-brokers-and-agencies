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
  type ChangeStaffRoleRequest,
  changeStaffRoleRequestSchema,
  idParamSchema,
  type InviteResponse,
  type InviteStaffRequest,
  inviteStaffRequestSchema,
  type StaffListQuery,
  type StaffListResponse,
  staffListQuerySchema,
  type StaffMember,
} from '@reih/contracts';
import { InvitationService, UserDirectory } from '../../identity/index.js';
import {
  CurrentUser,
  type RequestUser,
  Roles,
  ZodValidationPipe,
} from '../../../shared/http/index.js';

const id = new ZodValidationPipe(idParamSchema);

/** FR-ADM-03, UC-06.3: staff accounts, through identity's UserDirectory and InvitationService. */
@Roles('platform_admin')
@Controller('admin/staff')
export class AdminStaffController {
  constructor(
    private readonly directory: UserDirectory,
    private readonly invitations: InvitationService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(staffListQuerySchema)) query: StaffListQuery,
    @CurrentUser() user: RequestUser,
  ): Promise<StaffListResponse> {
    return this.directory.listStaff(user, query);
  }

  /** Invites a Data Operator or a Platform Admin. Resend and cancel: /admin/invitations/:id. */
  @Post('invitations')
  invite(
    @Body(new ZodValidationPipe(inviteStaffRequestSchema)) body: InviteStaffRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<InviteResponse> {
    return this.invitations.invite(user, body.email, body.role, null, body.language);
  }

  @Get(':id')
  get(@Param('id', id) userId: string, @CurrentUser() user: RequestUser): Promise<StaffMember> {
    return this.directory.getStaff(user, userId);
  }

  /** Refused for oneself and when it would leave no active Platform Admin. */
  @Patch(':id/role')
  changeRole(
    @Param('id', id) userId: string,
    @Body(new ZodValidationPipe(changeStaffRoleRequestSchema)) body: ChangeStaffRoleRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<StaffMember> {
    return this.directory.changeRole(user, userId, body.role);
  }

  /** Ends the user's sessions. Refused for oneself and for the last active Platform Admin. */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivate(
    @Param('id', id) userId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<StaffMember> {
    return this.directory.deactivate(user, userId);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  reactivate(
    @Param('id', id) userId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<StaffMember> {
    return this.directory.reactivate(user, userId);
  }
}
