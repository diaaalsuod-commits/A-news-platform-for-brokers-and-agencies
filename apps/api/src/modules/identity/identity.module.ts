import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AgencyModule } from '../agency/index.js';
import { DatabaseModule } from '../../shared/database/index.js';
import { AuthController } from './api/auth.controller.js';
import { AuthGuard, CsrfGuard, RolesGuard } from './api/guards.js';
import { MeController } from './api/me.controller.js';
import { AuthService } from './application/auth.service.js';
import { MeService } from './application/me.service.js';
import { SessionTerminationListener } from './application/session-termination.listener.js';
import { SessionService } from './application/session.service.js';
import { PasswordHasher } from './infrastructure/password-hasher.js';
import { SessionRepository } from './infrastructure/session.repository.js';
import { UserRepository } from './infrastructure/user.repository.js';

@Module({
  // docs/decisions.md: identity -> agency now; agency -> identity is planned for UC-04.7.
  imports: [DatabaseModule, AgencyModule],
  controllers: [AuthController, MeController],
  providers: [
    UserRepository,
    SessionRepository,
    PasswordHasher,
    SessionService,
    MeService,
    AuthService,
    SessionTerminationListener,
    // Global guards run in this order: session, then CSRF, then role.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class IdentityModule {}
