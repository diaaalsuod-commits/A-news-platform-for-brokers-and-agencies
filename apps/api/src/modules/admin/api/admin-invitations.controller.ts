import { Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { idParamSchema } from '@reih/contracts';
import { InvitationService } from '../../identity/index.js';
import {
  CurrentUser,
  type RequestUser,
  Roles,
  ZodValidationPipe,
} from '../../../shared/http/index.js';

const id = new ZodValidationPipe(idParamSchema);

/**
 * FR-ADM-01, FR-ADM-03: resend or cancel a pending invitation of staff or of an Agency Admin.
 * InvitationService decides which invitations the caller may manage.
 */
@Roles('platform_admin')
@Controller('admin/invitations')
export class AdminInvitationsController {
  constructor(private readonly invitations: InvitationService) {}

  /** A new link and a new expiry; the old link stops working. */
  @Post(':id/resend')
  @HttpCode(HttpStatus.NO_CONTENT)
  resend(@Param('id', id) invitationId: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.invitations.resend(user, invitationId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancel(@Param('id', id) invitationId: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.invitations.cancel(user, invitationId);
  }
}
