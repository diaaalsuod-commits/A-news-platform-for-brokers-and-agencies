import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { csrfHeaderName, type UserRole } from '@reih/contracts';
import type { Response } from 'express';
import { AppError, IS_PUBLIC, type RequestWithUser, ROLES } from '../../../shared/http/index.js';
import { SessionService } from '../application/session.service.js';
import { isWellFormedToken, tokensMatch } from '../application/tokens.js';
import { hasRequiredRole } from '../domain/roles.js';
import { clearSessionCookie, CSRF_COOKIE, readCookie, SESSION_COOKIE } from './auth-cookies.js';

const isPublic = (reflector: Reflector, context: ExecutionContext): boolean =>
  reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]) ===
  true;

/**
 * Global, first: every endpoint that is not @Public() needs a live session (FR-ACC-02, NFR-09).
 * It runs before the CSRF check, so a refused CSRF token is logged with its user.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (isPublic(this.reflector, context)) {
      return true;
    }
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithUser>();
    const token = readCookie(request, SESSION_COOKIE);
    const user = await this.sessions.authenticate(token);
    if (!user) {
      if (token !== undefined) {
        clearSessionCookie(http.getResponse<Response>());
      }
      throw new AppError('UNAUTHORIZED', HttpStatus.UNAUTHORIZED);
    }
    request.user = user;
    return true;
  }
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global, second (SRS 3.3, NFR-08): POST, PUT, PATCH and DELETE carry the CSRF cookie's value in the
 * X-CSRF-Token header. Login and logout too.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (SAFE_METHODS.has(request.method)) {
      return true;
    }
    const cookie = readCookie(request, CSRF_COOKIE);
    const header = request.headers[csrfHeaderName];
    if (isWellFormedToken(cookie) && typeof header === 'string' && tokensMatch(cookie, header)) {
      return true;
    }
    throw new AppError('CSRF_TOKEN_INVALID', HttpStatus.FORBIDDEN);
  }
}

/**
 * Global, third (FR-ACC-04): the caller's role must be one the endpoint allows. An endpoint that is
 * neither @Public() nor @Roles() is refused, so a forgotten declaration fails closed. The exception
 * filter logs every 403 with the user, role and route.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (isPublic(this.reflector, context)) {
      return true;
    }
    const allowed = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!allowed) {
      this.logger.error(
        `${context.getClass().name}.${context.getHandler().name} declares no @Roles(); refused`,
      );
      throw new AppError('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user || !hasRequiredRole(user.role, allowed)) {
      throw new AppError('FORBIDDEN', HttpStatus.FORBIDDEN);
    }
    return true;
  }
}
