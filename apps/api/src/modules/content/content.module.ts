import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../shared/database/index.js';
import { FilesModule } from '../../shared/files/index.js';
import { AdminModule } from '../admin/index.js';
import { AreasController } from './api/areas.controller.js';
import { DevelopersController } from './api/developers.controller.js';
import { MediaController } from './api/media.controller.js';
import { PaymentPlansController } from './api/payment-plans.controller.js';
import { UnitsController } from './api/units.controller.js';
import { ProjectsController } from './api/projects.controller.js';
import { ReferenceController } from './api/reference.controller.js';
import { SalesContactsController } from './api/sales-contacts.controller.js';
import { AreaService } from './application/area.service.js';
import { DeveloperService } from './application/developer.service.js';
import { MediaService } from './application/media.service.js';
import { PaymentPlanService } from './application/payment-plan.service.js';
import { UnitService } from './application/unit.service.js';
import { ProjectPublishingService } from './application/project-publishing.service.js';
import { ProjectService } from './application/project.service.js';
import { ProjectReadModel } from './application/project-read-model.js';
import { PublishGate } from './application/publish-gate.js';
import { ReferenceOptionsService } from './application/reference-options.service.js';
import { SalesContactReader } from './application/sales-contact-reader.js';
import { SalesContactService } from './application/sales-contact.service.js';
import { AreaRepository } from './infrastructure/area.repository.js';
import { DeveloperRepository } from './infrastructure/developer.repository.js';
import { MediaRepository } from './infrastructure/media.repository.js';
import { PaymentPlanRepository } from './infrastructure/payment-plan.repository.js';
import { UnitRepository } from './infrastructure/unit.repository.js';
import { ProjectReadRepository } from './infrastructure/project-read.repository.js';
import { ProjectRepository } from './infrastructure/project.repository.js';
import { SalesContactRepository } from './infrastructure/sales-contact.repository.js';

@Module({
  // docs/decisions.md (P4.1, P4.2, P4.4): content imports only admin (ReferenceDataReader for
  // amenities, unit references and the form options; SettingsReader for the stale threshold). The modules that read content import it.
  imports: [DatabaseModule, FilesModule, AdminModule],
  controllers: [
    DevelopersController,
    SalesContactsController,
    AreasController,
    ProjectsController,
    MediaController,
    PaymentPlansController,
    UnitsController,
    ReferenceController,
  ],
  providers: [
    DeveloperRepository,
    SalesContactRepository,
    AreaRepository,
    DeveloperService,
    SalesContactService,
    AreaService,
    SalesContactReader,
    ProjectRepository,
    PublishGate,
    ProjectService,
    ProjectPublishingService,
    MediaRepository,
    MediaService,
    ProjectReadRepository,
    ProjectReadModel,
    PaymentPlanRepository,
    PaymentPlanService,
    UnitRepository,
    UnitService,
    ReferenceOptionsService,
  ],
  exports: [SalesContactReader, ProjectReadModel],
})
export class ContentModule {}
