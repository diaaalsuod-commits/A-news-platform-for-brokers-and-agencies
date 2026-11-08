import { HttpStatus, Injectable } from '@nestjs/common';
import type { InviteAgencyAdminRequest, InviteResponse } from '@reih/contracts';
import { AgencyService } from '../../agency/index.js';
import { InvitationService, type Inviter } from '../../identity/index.js';
import { AppError } from '../../../shared/http/index.js';

/**
 * FR-ADM-01: the Platform Admin invites an agency's Agency Admin through identity's
 * InvitationService, which sends the email and checks who may invite whom. The first one, or a
 * later one when the agency needs a way back in; never into a suspended agency, whose members
 * cannot log in (BR-13).
 */
@Injectable()
export class AgencyOnboardingService {
  constructor(
    private readonly agencies: AgencyService,
    private readonly invitations: InvitationService,
  ) {}

  async inviteAgencyAdmin(
    by: Inviter,
    agencyId: string,
    input: InviteAgencyAdminRequest,
  ): Promise<InviteResponse> {
    const agency = await this.agencies.get(agencyId);
    if (agency.status === 'suspended') {
      throw new AppError('AGENCY_SUSPENDED', HttpStatus.CONFLICT);
    }
    return this.invitations.invite(by, input.email, 'agency_admin', agencyId, input.language);
  }
}
