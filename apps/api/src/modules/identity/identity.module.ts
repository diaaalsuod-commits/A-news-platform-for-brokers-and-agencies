import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminModule } from '../admin/index.js';
import { AgencyModule } from '../agency/index.js';
import { DatabaseModule } from '../../shared/database/index.js';
import { FilesModule } from '../../shared/files/index.js';
import { MailModule } from '../../shared/mail/index.js';
import { AuthController } from './api/auth.controller.js';
import { AuthGuard, CsrfGuard, RolesGuard } from './api/guards.js';
import { MeController } from './api/me.controller.js';
import { AccountLinks } from './application/account-links.js';
import { AccountService } from './application/account.service.js';
import { ActivationService } from './application/activation.service.js';
import { AuthService } from './application/auth.service.js';
import { InvitationService } from './application/invitation.service.js';
import { MeService } from './application/me.service.js';
import { PasswordService } from './application/password.service.js';
import { SessionTerminationListener } from './application/session-termination.listener.js';
import { SessionService } from './application/session.service.js';
import { InvitationRepository } from './infrastructure/invitation.repository.js';
import { PasswordHasher } from './infrastructure/password-hasher.js';
import { PasswordResetRepository } from './infrastructure/password-reset.repository.js';
import { SessionRepository } from './infrastructure/session.repository.js';
import { UserRepository } from './infrastructure/user.repository.js';

@Module({
  // docs/decisions.md: identity -> agency and identity -> admin now; agency -> identity is planned
  // for UC-04.7.
  imports: [DatabaseModule, MailModule, FilesModule, AgencyModule, AdminModule],
  controllers: [AuthController, MeController],
  providers: [
    UserRepository,
    SessionRepository,
    InvitationRepository,
    PasswordResetRepository,
    PasswordHasher,
    AccountLinks,
    SessionService,
    MeService,
    AuthService,
    ActivationService,
    InvitationService,
    PasswordService,
    AccountService,
    SessionTerminationListener,
    // Global guards run in this order: session, then CSRF, then role.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [InvitationService],
})
export class IdentityModule {}
