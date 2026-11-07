import type { INestApplication } from '@nestjs/common';

export const API_PREFIX = 'api/v1';

/** Shared by main.ts and the API tests, so both run the same application. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
}
