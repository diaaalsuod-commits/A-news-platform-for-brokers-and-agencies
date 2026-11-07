import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/index.js';
import { RedisModule } from '../queue/index.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HttpModule {}
