import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { AdminModule } from './modules/admin/index.js';
import { AgencyModule } from './modules/agency/index.js';
import { CatalogModule } from './modules/catalog/index.js';
import { ContactModule } from './modules/contact/index.js';
import { ContentModule } from './modules/content/index.js';
import { ExploreModule } from './modules/explore/index.js';
import { FavoritesModule } from './modules/favorites/index.js';
import { IdentityModule } from './modules/identity/index.js';
import { ProjectQueryModule } from './modules/project-query/index.js';
import { AuditModule } from './shared/audit/index.js';
import { ConfigModule, ENV, type Env } from './shared/config/index.js';
import { EventsModule } from './shared/events/index.js';
import { buildPinoHttpOptions, HttpModule } from './shared/http/index.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ENV],
      useFactory: (env: Env) => ({ pinoHttp: buildPinoHttpOptions(env) }),
    }),
    EventsModule,
    HttpModule,
    AuditModule,
    IdentityModule,
    AgencyModule,
    AdminModule,
    ContentModule,
    ExploreModule,
    ProjectQueryModule,
    ContactModule,
    CatalogModule,
    FavoritesModule,
  ],
})
export class AppModule {}
