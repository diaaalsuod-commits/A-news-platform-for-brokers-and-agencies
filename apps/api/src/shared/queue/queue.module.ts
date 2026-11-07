import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/index.js';
import { CatalogPdfQueue } from './catalog-pdf.queue.js';

@Module({
  providers: [
    {
      provide: CatalogPdfQueue,
      inject: [ENV],
      useFactory: (env: Env) => new CatalogPdfQueue(env.REDIS_URL),
    },
  ],
  exports: [CatalogPdfQueue],
})
export class QueueModule {}
