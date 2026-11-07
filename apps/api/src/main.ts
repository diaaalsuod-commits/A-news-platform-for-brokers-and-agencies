import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { EnvValidationError, parseEnv } from './shared/config/index.js';

async function bootstrap(): Promise<void> {
  // Validate first, so a bad environment stops the process before anything connects.
  const env = parseEnv(process.env);

  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const logger = app.get(Logger);
  app.useLogger(logger);
  configureApp(app);

  await app.listen(env.API_PORT);
  logger.log(`API listening on port ${env.API_PORT}`, 'Bootstrap');
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof EnvValidationError ? error.message : error);
  process.exit(1);
});
