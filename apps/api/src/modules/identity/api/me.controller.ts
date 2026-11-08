import { Controller, Get } from '@nestjs/common';
import type { MeResponse } from '@reih/contracts';
import type { RequestUser } from '../../../shared/http/index.js';
import { MeService } from '../application/me.service.js';
import { CurrentUser, Roles } from './roles.decorator.js';

@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  /** The caller's own account only; there is no id to ask for anyone else's (NFR-09). */
  @Roles('broker', 'agency_admin', 'data_operator', 'platform_admin')
  @Get()
  get(@CurrentUser() user: RequestUser): Promise<MeResponse> {
    return this.me.get(user.id);
  }
}
