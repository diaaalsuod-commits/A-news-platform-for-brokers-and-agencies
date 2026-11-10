import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/index.js';
import { FilesModule } from '../../shared/files/index.js';
import { AreasController } from './api/areas.controller.js';
import { DevelopersController } from './api/developers.controller.js';
import { SalesContactsController } from './api/sales-contacts.controller.js';
import { AreaService } from './application/area.service.js';
import { DeveloperService } from './application/developer.service.js';
import { SalesContactReader } from './application/sales-contact-reader.js';
import { SalesContactService } from './application/sales-contact.service.js';
import { AreaRepository } from './infrastructure/area.repository.js';
import { DeveloperRepository } from './infrastructure/developer.repository.js';
import { SalesContactRepository } from './infrastructure/sales-contact.repository.js';

@Module({
  // docs/decisions.md (P4.1): content imports no module now, and only admin later (its
  // ReferenceDataReader, for projects and units). The modules that read content import it.
  imports: [DatabaseModule, FilesModule],
  controllers: [DevelopersController, SalesContactsController, AreasController],
  providers: [
    DeveloperRepository,
    SalesContactRepository,
    AreaRepository,
    DeveloperService,
    SalesContactService,
    AreaService,
    SalesContactReader,
  ],
  exports: [SalesContactReader],
})
export class ContentModule {}
