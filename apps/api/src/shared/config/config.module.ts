import { Global, Module } from '@nestjs/common';
import { parseEnv } from './env.schema.js';
import { ENV } from './env.token.js';

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: () => parseEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
