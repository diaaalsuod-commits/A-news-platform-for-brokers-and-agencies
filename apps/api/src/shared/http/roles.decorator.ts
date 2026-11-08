import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { UserRole } from '@reih/contracts';
import type { RequestUser, RequestWithUser } from './request-user.js';

export const ROLES = 'roles';

/**
 * FR-ACC-04: the roles allowed on an endpoint. Metadata only, like @Public(); identity's RolesGuard
 * enforces it, so every module can declare roles without importing identity. Every endpoint that is not @Public()
 * must declare it; one without it is refused. Allowing 'broker' also allows 'agency_admin'.
 */
export const Roles = (...roles: [UserRole, ...UserRole[]]) => SetMetadata(ROLES, roles);

/** The logged-in caller, set by AuthGuard. Only on endpoints that are not @Public(). */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestUser => {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user) {
      throw new Error('CurrentUser used on an endpoint without a logged-in user');
    }
    return user;
  },
);
