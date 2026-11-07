import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DatabaseModule } from '../database/index.js';
import { RedisModule } from '../queue/index.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { HttpExceptionFilter } from './http-exception.filter.js';
import { RateLimitModule } from './rate-limit.js';

@Module({
  imports: [DatabaseModule, RedisModule, RateLimitModule],
  controllers: [HealthController],
  providers: [HealthService, { provide: APP_FILTER, useClass: HttpExceptionFilter }],
})
export class HttpModule {}
