import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import {
  type CsrfResponse,
  type LoginRequest,
  loginRequestSchema,
  type MeResponse,
} from '@reih/contracts';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { Public, RateLimit, ZodValidationPipe } from '../../../shared/http/index.js';
import { AuthService } from '../application/auth.service.js';
import { SessionService } from '../application/session.service.js';
import { isWellFormedToken, newToken } from '../application/tokens.js';
import { LOGIN_RATE_LIMITS } from '../domain/login-policy.js';
import {
  clearSessionCookie,
  CSRF_COOKIE,
  readCookie,
  SESSION_COOKIE,
  setCsrfCookie,
  setSessionCookie,
} from './auth-cookies.js';

/**
 * Counted before validation, so the same normalisation as the login schema applies, and an unknown
 * email is counted exactly like a known one. Hashed, so Redis holds no email addresses.
 */
function loginEmailKey(request: Request): string {
  const email: unknown = (request.body as { email?: unknown } | undefined)?.email;
  const normalised = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return createHash('sha256').update(normalised).digest('hex');
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  /** SRS 3.3. Keeps a well-formed token the browser already has, so other open tabs keep working. */
  @Public()
  @Get('csrf')
  csrf(@Req() request: Request, @Res({ passthrough: true }) response: Response): CsrfResponse {
    const existing = readCookie(request, CSRF_COOKIE);
    const token = isWellFormedToken(existing) ? existing : newToken();
    setCsrfCookie(response, token);
    return { token };
  }

  /** UC-01.2, FR-ACC-02, BR-13. */
  @Public()
  @RateLimit(
    { name: 'login-ip', ...LOGIN_RATE_LIMITS.perIp, whenRedisDown: 'allow' },
    {
      name: 'login-email',
      ...LOGIN_RATE_LIMITS.perEmail,
      whenRedisDown: 'allow',
      key: loginEmailKey,
    },
  )
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) body: LoginRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<MeResponse> {
    const { token, me } = await this.auth.login(body, {
      ipAddress: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
      previousToken: readCookie(request, SESSION_COOKIE),
    });
    setSessionCookie(response, token);
    return me;
  }

  /** UC-01.3, FR-ACC-02: ends the session on the server. Answers the same with no session. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.sessions.end(readCookie(request, SESSION_COOKIE));
    clearSessionCookie(response);
  }
}
