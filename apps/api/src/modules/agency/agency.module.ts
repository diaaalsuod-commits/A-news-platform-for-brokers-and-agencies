import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/index.js';
import { AgencyService } from './application/agency.service.js';
import { AgencyRepository } from './infrastructure/agency.repository.js';

@Module({
  imports: [DatabaseModule],
  providers: [AgencyRepository, AgencyService],
  exports: [AgencyService],
})
export class AgencyModule {}
