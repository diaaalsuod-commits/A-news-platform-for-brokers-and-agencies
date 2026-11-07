import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { DATABASE, DB_POOL } from './database.tokens.js';

export type DatabaseTransaction = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(
    @Inject(DATABASE) private readonly db: NodePgDatabase,
    @Inject(DB_POOL) private readonly pool: pg.Pool,
  ) {}

  async ping(): Promise<void> {
    await this.db.execute(sql`SELECT 1`);
  }

  /**
   * Runs fn in a transaction that names the acting user for the unit history trigger (FR-DAT-09).
   * set_config(..., true) is SET LOCAL in a form that accepts a bound parameter.
   */
  async withUser<T>(userId: string, fn: (tx: DatabaseTransaction) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('reih.user_id', ${userId}, true)`);
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
