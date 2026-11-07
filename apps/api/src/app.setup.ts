import type { INestApplication } from '@nestjs/common';
import type { Express } from 'express';

export const API_PREFIX = 'api/v1';

/** Shared by main.ts and the API tests, so both run the same application. */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.enableShutdownHooks();
  // Caddy is the one proxy in front of the API. Without this, the rate limiter sees Caddy's address
  // for every caller and counts them all as one.
  (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
}
