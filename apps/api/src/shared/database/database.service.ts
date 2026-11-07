import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { DATABASE, DB_POOL } from './database.tokens.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase,
    @Inject(DB_POOL) private readonly pool: pg.Pool,
  ) {}

  async ping(): Promise<void> {
    await this.db.execute(sql`SELECT 1`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
