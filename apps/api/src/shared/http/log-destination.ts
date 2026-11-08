import { Module } from '@nestjs/common';
import pino from 'pino';

/** Where the JSON log goes. Standard output, except in tests that read the log back. */
export const LOG_DESTINATION = Symbol('LOG_DESTINATION');

@Module({
  providers: [{ provide: LOG_DESTINATION, useFactory: () => pino.destination(1) }],
  exports: [LOG_DESTINATION],
})
export class LogDestinationModule {}
