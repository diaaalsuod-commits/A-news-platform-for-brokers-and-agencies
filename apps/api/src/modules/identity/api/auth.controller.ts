import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req, Res } from '@nestjs/common';
import {
  type ActivateRequest,
  activateRequestSchema,
  type CsrfResponse,
  type ForgotPasswordRequest,
  forgotPasswordRequestSchema,
  type InvitationCheckResponse,
  type LoginRequest,
  loginRequestSchema,
  type MeResponse,
  type ResetPasswordRequest,
  resetPasswordRequestSchema,
} from '@reih/contracts';
import type { Request, Response } from 'express';
import { Public, RateLimit, ZodValidationPipe } from '../../../shared/http/index.js';
import { ActivationService } from '../application/activation.service.js';
import { AuthService } from '../application/auth.service.js';
import { PasswordService } from '../application/password.service.js';
import { SessionService } from '../application/session.service.js';
import { isWellFormedToken, newToken } from '../application/tokens.js';
import { IDENTITY_RATE_LIMITS as LIMITS } from '../domain/rate-limits.js';
import {
  clearSessionCookie,
  CSRF_COOKIE,
  readCookie,
  SESSION_COOKIE,
  setCsrfCookie,
  setSessionCookie,
} from './auth-cookies.js';
import { bodyTokenKey, emailKey, paramTokenKey } from './rate-limit-keys.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly activation: ActivationService,
    private readonly passwords: PasswordService,
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
    { name: 'login-ip', ...LIMITS.login.perIp, whenRedisDown: 'allow' },
    { name: 'login-email', ...LIMITS.login.perEmail, whenRedisDown: 'allow', key: emailKey },
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

  /** FR-ACC-01: whether an invitation link still works. The logged URL hides the token. */
  @Public()
  @RateLimit(
    { name: 'invitation-ip', ...LIMITS.invitation.perIp, whenRedisDown: 'reject' },
    {
      name: 'invitation-token',
      ...LIMITS.invitation.perToken,
      whenRedisDown: 'reject',
      key: paramTokenKey,
    },
  )
  @Get('invitations/:token')
  checkInvitation(@Param('token') token: string): Promise<InvitationCheckResponse> {
    return this.activation.check(token);
  }

  /** FR-ACC-01, UC-01.1. The user logs in afterwards. */
  @Public()
  @RateLimit(
    { name: 'invitation-ip', ...LIMITS.invitation.perIp, whenRedisDown: 'reject' },
    {
      name: 'invitation-token',
      ...LIMITS.invitation.perToken,
      whenRedisDown: 'reject',
      key: bodyTokenKey,
    },
  )
  @Post('activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  activate(
    @Body(new ZodValidationPipe(activateRequestSchema)) body: ActivateRequest,
  ): Promise<void> {
    return this.activation.activate(body);
  }

  /** FR-ACC-03: the same answer, in the same time, for known and unknown emails. */
  @Public()
  @RateLimit(
    { name: 'forgot-ip', ...LIMITS.forgot.perIp, whenRedisDown: 'reject' },
    { name: 'forgot-email', ...LIMITS.forgot.perEmail, whenRedisDown: 'reject', key: emailKey },
  )
  @Post('forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  forgot(@Body(new ZodValidationPipe(forgotPasswordRequestSchema)) body: ForgotPasswordRequest) {
    this.passwords.requestReset(body.email);
  }

  /** FR-ACC-03: a single-use link valid for 60 minutes. */
  @Public()
  @RateLimit(
    { name: 'reset-ip', ...LIMITS.reset.perIp, whenRedisDown: 'reject' },
    { name: 'reset-token', ...LIMITS.reset.perToken, whenRedisDown: 'reject', key: bodyTokenKey },
  )
  @Post('reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  reset(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) body: ResetPasswordRequest,
  ): Promise<void> {
    return this.passwords.reset(body.token, body.password);
  }
}
