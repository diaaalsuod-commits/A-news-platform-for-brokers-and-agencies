import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { type CatalogPdfJob, catalogPdfJobSchema, catalogPdfQueueName } from '@reih/contracts';
import { type DefaultJobOptions, Queue } from 'bullmq';

/** SRS 3.2: a failed job is retried twice, then marked failed. attempts counts the first run too. */
export const catalogPdfJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: true,
  removeOnFail: { count: 1_000 },
} as const satisfies DefaultJobOptions;

@Injectable()
export class CatalogPdfQueue implements OnModuleDestroy {
  private readonly queue: Queue<CatalogPdfJob>;

  constructor(redisUrl: string) {
    this.queue = new Queue(catalogPdfQueueName, {
      // Report a Redis outage to the caller at once instead of queueing commands until it returns.
      connection: { url: redisUrl, enableOfflineQueue: false, maxRetriesPerRequest: 1 },
      defaultJobOptions: catalogPdfJobOptions,
    });
    // Without a listener, a connection error would be reported as unhandled.
    this.queue.on('error', (error) => new Logger(CatalogPdfQueue.name).warn(error.message));
  }

  async add(job: CatalogPdfJob): Promise<void> {
    await this.queue.add(catalogPdfQueueName, catalogPdfJobSchema.parse(job));
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}
