import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  type ChangePasswordRequest,
  changePasswordRequestSchema,
  type MeResponse,
  PROFILE_PHOTO_MAX_BYTES,
  profilePhotoField,
  type UpdatePreferencesRequest,
  updatePreferencesRequestSchema,
  type UpdateProfileRequest,
  updateProfileRequestSchema,
} from '@reih/contracts';
import type { Request, Response } from 'express';
import {
  RateLimit,
  readSingleFile,
  type RequestUser,
  ZodValidationPipe,
} from '../../../shared/http/index.js';
import { AccountService } from '../application/account.service.js';
import { MeService } from '../application/me.service.js';
import { PasswordService } from '../application/password.service.js';
import { IDENTITY_RATE_LIMITS as LIMITS } from '../domain/rate-limits.js';
import { userKey } from './rate-limit-keys.js';
import { CurrentUser, Roles } from './roles.decorator.js';

/** The caller's own account only: no route takes a user id, so nobody reaches another's (NFR-09). */
@Roles('broker', 'agency_admin', 'data_operator', 'platform_admin')
@Controller('me')
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly account: AccountService,
    private readonly passwords: PasswordService,
  ) {}

  @Get()
  get(@CurrentUser() user: RequestUser): Promise<MeResponse> {
    return this.me.get(user.id);
  }

  /** FR-ACC-05: name, mobile, WhatsApp, job title and BRN. */
  @Patch()
  async updateProfile(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateProfileRequestSchema)) body: UpdateProfileRequest,
  ): Promise<MeResponse> {
    await this.account.updateProfile(user.id, body);
    return this.me.get(user.id);
  }

  /** FR-ACC-06: language, display currency and area unit, applied at every login. */
  @Patch('preferences')
  async updatePreferences(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updatePreferencesRequestSchema)) body: UpdatePreferencesRequest,
  ): Promise<MeResponse> {
    await this.account.updatePreferences(user.id, body);
    return this.me.get(user.id);
  }

  /** FR-ACC-03: needs the current password; ends the user's other sessions. */
  @RateLimit({
    name: 'password-change',
    ...LIMITS.passwordChange.perUser,
    whenRedisDown: 'reject',
    key: userKey,
  })
  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) body: ChangePasswordRequest,
  ): Promise<void> {
    return this.passwords.change(user, body);
  }

  /** FR-ACC-05: multipart/form-data with one file in the "photo" field, JPEG or PNG up to 2 MB. */
  @Put('photo')
  async replacePhoto(
    @CurrentUser() user: RequestUser,
    @Req() request: Request,
  ): Promise<MeResponse> {
    await readSingleFile(
      request,
      { field: profilePhotoField, maxBytes: PROFILE_PHOTO_MAX_BYTES },
      (file) => this.account.replacePhoto(user.id, file),
    );
    return this.me.get(user.id);
  }

  @Delete('photo')
  async removePhoto(@CurrentUser() user: RequestUser): Promise<MeResponse> {
    await this.account.removePhoto(user.id);
    return this.me.get(user.id);
  }

  /** The caller's own photo, never cached by a shared cache. */
  @Get('photo')
  async photo(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const { stream, headers } = await this.account.openPhoto(user.id);
    response.set({ ...headers, 'Cache-Control': 'private' });
    return new StreamableFile(stream, { type: headers['Content-Type'] });
  }
}
