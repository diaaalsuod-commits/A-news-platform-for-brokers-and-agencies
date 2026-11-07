import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { EnvValidationError, parseEnv } from './env.js';
import { WorkerModule } from './worker.module.js';

async function bootstrap(): Promise<void> {
  // Validate first, so a bad environment stops the process before anything connects.
  parseEnv(process.env);

  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  await app.init();
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
});
