import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/index.js';
import { DatabaseModule } from '../../shared/database/index.js';
import { FilesModule } from '../../shared/files/index.js';
import { AgencyBrandingController } from './api/agency-branding.controller.js';
import { AgencyInvitationsController } from './api/agency-invitations.controller.js';
import { AgencyMembersController } from './api/agency-members.controller.js';
import { AgencyMembersService } from './application/agency-members.service.js';
import { AgencyService } from './application/agency.service.js';
import { AgencyRepository } from './infrastructure/agency.repository.js';
import { BrandingRepository } from './infrastructure/branding.repository.js';

@Module({
  // docs/decisions.md (P3.1): admin -> agency -> identity, one way. AgencyService backs identity's
  // AgencyStatusPort, so it must never depend on an identity provider; AgencyMembersService does.
  imports: [DatabaseModule, FilesModule, IdentityModule],
  controllers: [AgencyBrandingController, AgencyMembersController, AgencyInvitationsController],
  providers: [AgencyRepository, BrandingRepository, AgencyService, AgencyMembersService],
  exports: [AgencyService],
})
export class AgencyModule {}
