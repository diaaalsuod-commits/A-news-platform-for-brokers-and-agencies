import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import type { HealthResponse } from '@reih/contracts';
import type { Response } from 'express';
import { HealthService } from './health.service.js';
import { Public } from './public.decorator.js';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Public()
  @Get()
  async get(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
    const result = await this.health.check();
    response.status(result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return result;
  }
}
