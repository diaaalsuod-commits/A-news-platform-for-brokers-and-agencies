import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  type PlatformSettingsResponse,
  type UpdateSettingsRequest,
  updateSettingsRequestSchema,
} from '@reih/contracts';
import {
  CurrentUser,
  type RequestUser,
  Roles,
  ZodValidationPipe,
} from '../../../shared/http/index.js';
import { SettingsService } from '../application/settings.service.js';

/** FR-ADM-06, UC-06.6. */
@Roles('platform_admin')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<PlatformSettingsResponse> {
    return this.settings.get();
  }

  @Patch()
  update(
    @Body(new ZodValidationPipe(updateSettingsRequestSchema)) body: UpdateSettingsRequest,
    @CurrentUser() user: RequestUser,
  ): Promise<PlatformSettingsResponse> {
    return this.settings.update(body, user.id);
  }
}
