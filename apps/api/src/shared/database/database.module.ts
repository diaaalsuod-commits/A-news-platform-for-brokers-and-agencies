import { Logger, Module } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { ENV, type Env } from '../config/index.js';
import { DatabaseService } from './database.service.js';
import { DATABASE, DB_POOL } from './database.tokens.js';

@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [ENV],
      useFactory: (env: Env) => {
        const pool = new pg.Pool({
          connectionString: env.DATABASE_URL,
          connectionTimeoutMillis: 2_000,
        });
        // Without a listener, an idle connection error would stop the process.
        pool.on('error', (error) => new Logger('Database').warn(error.message));
        return pool;
      },
    },
    {
      provide: DATABASE,
      inject: [DB_POOL],
      useFactory: (pool: pg.Pool) => drizzle({ client: pool }),
    },
    DatabaseService,
  ],
  exports: [DATABASE, DatabaseService],
})
export class DatabaseModule {}
