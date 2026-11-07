import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DatabaseService } from '../src/shared/database/index.js';

const MIGRATIONS = join(import.meta.dirname, '../drizzle');
const REFERENCE_SQL = join(import.meta.dirname, '../../../docs/design/schema.sql');

const NOT_FROM_EXTENSION = (oidColumn: string, catalog: string) => `NOT EXISTS (
  SELECT 1 FROM pg_depend d
  WHERE d.classid = '${catalog}'::regclass AND d.objid = ${oidColumn} AND d.deptype = 'e'
)`;

const TABLES_SQL = `
  SELECT c.relname AS name
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND ${NOT_FROM_EXTENSION('c.oid', 'pg_class')}
  ORDER BY 1`;

/** Each query reads one part of the database in a form that does not depend on how it was created. */
const CATALOG_QUERIES: Record<string, string> = {
  tables: TABLES_SQL,
  extensions: `SELECT extname FROM pg_extension ORDER BY 1`,
  enums: `
    SELECT t.typname, e.enumsortorder, e.enumlabel
    FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
    ORDER BY 1, 2`,
  columns: `
    SELECT c.relname, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS type,
      a.attnotnull, pg_get_expr(ad.adbin, ad.adrelid) AS default_value
    FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped
      AND ${NOT_FROM_EXTENSION('c.oid', 'pg_class')}
    ORDER BY 1, 2`,
  constraints: `
    SELECT c.conrelid::regclass::text AS table_name, c.conname, c.contype::text,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.contype <> 't' AND c.conrelid <> 0
      AND c.conrelid::regclass::text <> 'spatial_ref_sys'
    ORDER BY 1, 2`,
  indexes: `
    SELECT tablename, indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys'
    ORDER BY 1, 2`,
  triggers: `
    SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal
    ORDER BY 1, 2`,
  functions: `
    SELECT p.proname, p.prosrc
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND ${NOT_FROM_EXTENSION('p.oid', 'pg_proc')}
    ORDER BY 1`,
  seededRows: `
    SELECT 'currencies' AS source,
      to_jsonb(c) - 'id' - 'created_at' - 'updated_at' AS row FROM currencies c
    UNION ALL
    SELECT 'settings', to_jsonb(s) - 'id' - 'created_at' - 'updated_at' FROM settings s
    ORDER BY 1`,
};

describe('database schema', () => {
  let container: StartedPostgreSqlContainer;
  let admin: pg.Pool;
  let migrated: pg.Pool;
  let reference: pg.Pool;
  let servicePool: pg.Pool;
  let database: DatabaseService;
  let fixture: { userId: string; projectId: string; propertyTypeId: string; layoutId: string };

  const poolFor = (name: string, max = 5) => {
    const url = new URL(container.getConnectionUri());
    url.pathname = `/${name}`;
    return new pg.Pool({ connectionString: url.toString(), max });
  };

  const insert = async (statement: string, values: unknown[] = []): Promise<string> => {
    const { rows } = await migrated.query<{ id: string }>(`${statement} RETURNING id`, values);
    return rows[0]!.id;
  };

  const createUnit = (unitNumber: string) =>
    insert(
      `INSERT INTO units (project_id, unit_number, property_type_id, layout_id, internal_area_sqm, price_aed)
       VALUES ($1, $2, $3, $4, 80, 1000000)`,
      [fixture.projectId, unitNumber, fixture.propertyTypeId, fixture.layoutId],
    );

  const historyOf = async (unitId: string) => {
    const { rows } = await migrated.query(
      'SELECT field, old_value, new_value, changed_by FROM unit_history WHERE unit_id = $1',
      [unitId],
    );
    return rows;
  };

  /** A plan and its milestones in one transaction, because BR-02 is checked at commit. */
  const createPlan = async (name: string, percentages: number[]) => {
    const client = await migrated.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query<{ id: string }>(
        'INSERT INTO payment_plans (project_id, name) VALUES ($1, $2) RETURNING id',
        [fixture.projectId, name],
      );
      for (const [index, percentage] of percentages.entries()) {
        await client.query(
          `INSERT INTO payment_plan_milestones (plan_id, seq, label_en, percentage, timing)
           VALUES ($1, $2, 'Milestone', $3, 'on_booking')`,
          [rows[0]!.id, index + 1, percentage],
        );
      }
      await client.query('COMMIT');
      return rows[0]!.id;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    admin = new pg.Pool({ connectionString: container.getConnectionUri() });

    // The image installs PostGIS in its own database. New databases start without any extension,
    // so the extensions migration has to do its job.
    await admin.query('CREATE DATABASE reih_migrated');
    await admin.query('CREATE DATABASE reih_reference');

    migrated = poolFor('reih_migrated');
    await migrate(drizzle({ client: migrated }), { migrationsFolder: MIGRATIONS });

    reference = poolFor('reih_reference');
    await reference.query(readFileSync(REFERENCE_SQL, 'utf8'));

    const userId = await insert(
      `INSERT INTO users (email, role, status) VALUES ('operator@example.test', 'data_operator', 'active')`,
    );
    const developerId = await insert(
      `INSERT INTO developers (name_ar, name_en) VALUES ('مطور', 'Developer')`,
    );
    const emirateId = await insert(
      `INSERT INTO areas (level, name_ar, name_en, center)
       VALUES ('emirate', 'دبي', 'Dubai', 'SRID=4326;POINT(55.27 25.2)')`,
    );
    const communityId = await insert(
      `INSERT INTO areas (parent_id, level, name_ar, name_en, center)
       VALUES ($1, 'community', 'مجتمع', 'Community', 'SRID=4326;POINT(55.27 25.2)')`,
      [emirateId],
    );
    const projectId = await insert(
      `INSERT INTO projects (developer_id, community_id, name_ar, name_en, location, stage,
         ownership_type, created_by, updated_by)
       VALUES ($1, $2, 'مشروع', 'Project', 'SRID=4326;POINT(55.27 25.2)', 'upcoming',
         'freehold', $3, $3)`,
      [developerId, communityId, userId],
    );
    const propertyTypeId = await insert(
      `INSERT INTO property_types (code, name_ar, name_en) VALUES ('apartment', 'شقة', 'Apartment')`,
    );
    const layoutId = await insert(
      `INSERT INTO layouts (code, bedrooms, name_ar, name_en) VALUES ('1br', 1, 'غرفة', '1 Bedroom')`,
    );
    fixture = { userId, projectId, propertyTypeId, layoutId };

    // DatabaseService closes the pool it is given. One connection, so a later query on this pool
    // shows whether the acting user outlived the transaction.
    servicePool = poolFor('reih_migrated', 1);
    database = new DatabaseService(drizzle({ client: servicePool }), servicePool);
  });

  afterAll(async () => {
    await database?.onModuleDestroy();
    await Promise.all([migrated?.end(), reference?.end(), admin?.end()]);
    await container?.stop();
  });

  it('creates exactly 36 tables, not counting the ones PostGIS owns', async () => {
    const { rows } = await migrated.query(TABLES_SQL);
    expect(rows).toHaveLength(36);
  });

  // The migrated database is compared with a fresh load of docs/design/schema.sql.
  it.each(Object.keys(CATALOG_QUERIES))('matches schema.sql: %s', async (part) => {
    const query = CATALOG_QUERIES[part]!;
    const [actual, expected] = await Promise.all([migrated.query(query), reference.query(query)]);
    expect(expected.rows.length).toBeGreaterThan(0);
    expect(actual.rows).toEqual(expected.rows);
  });

  it('BR-02 rejects a payment plan totalling 50%', async () => {
    await expect(createPlan('Half', [50])).rejects.toThrow(/BR-02/);
    const { rows } = await migrated.query(`SELECT id FROM payment_plans WHERE name = 'Half'`);
    expect(rows).toEqual([]);
  });

  it('BR-02 accepts a payment plan totalling 100%', async () => {
    await expect(createPlan('Full', [30, 70])).resolves.toEqual(expect.any(String));
  });

  it('BR-16 rejects updating or deleting unit history', async () => {
    const unitId = await createUnit('BR-16');
    await database.withUser(fixture.userId, (tx) =>
      tx.execute(sql`UPDATE units SET price_aed = 1100000 WHERE id = ${unitId}`),
    );
    expect(await historyOf(unitId)).toHaveLength(1);

    await expect(
      migrated.query(`UPDATE unit_history SET new_value = '1' WHERE unit_id = $1`, [unitId]),
    ).rejects.toThrow(/BR-16/);
    await expect(
      migrated.query('DELETE FROM unit_history WHERE unit_id = $1', [unitId]),
    ).rejects.toThrow(/BR-16/);
    expect(await historyOf(unitId)).toHaveLength(1);
  });

  it('FR-DAT-09 one price change adds exactly one history row', async () => {
    const unitId = await createUnit('FR-DAT-09-price');
    await database.withUser(fixture.userId, (tx) =>
      tx.execute(sql`UPDATE units SET price_aed = 1250000 WHERE id = ${unitId}`),
    );
    expect(await historyOf(unitId)).toEqual([
      {
        field: 'price',
        old_value: '1000000.00',
        new_value: '1250000.00',
        changed_by: fixture.userId,
      },
    ]);
  });

  it('FR-DAT-09 one status change adds exactly one history row', async () => {
    const unitId = await createUnit('FR-DAT-09-status');
    await database.withUser(fixture.userId, (tx) =>
      tx.execute(sql`UPDATE units SET status = 'sold' WHERE id = ${unitId}`),
    );
    expect(await historyOf(unitId)).toEqual([
      { field: 'status', old_value: 'available', new_value: 'sold', changed_by: fixture.userId },
    ]);
  });

  it('FR-DAT-09 an update that changes neither price nor status adds no history row', async () => {
    const unitId = await createUnit('FR-DAT-09-other');
    await database.withUser(fixture.userId, (tx) =>
      tx.execute(sql`UPDATE units SET bathrooms = 2 WHERE id = ${unitId}`),
    );
    expect(await historyOf(unitId)).toEqual([]);
  });

  it('FR-DAT-09 a price change without an acting user fails', async () => {
    const unitId = await createUnit('FR-DAT-09-anonymous');
    await expect(
      migrated.query('UPDATE units SET price_aed = 1 WHERE id = $1', [unitId]),
    ).rejects.toThrow();
    expect(await historyOf(unitId)).toEqual([]);
  });

  describe('frozen catalog versions', () => {
    /** A catalog version whose rate and requesting user are used by nothing else. */
    const createCatalogVersion = async (name: string) => {
      const requesterId = await insert(
        `INSERT INTO users (email, role, status) VALUES ($1, 'data_operator', 'active')`,
        [`${name}@example.test`],
      );
      const rateId = await insert(
        `INSERT INTO exchange_rates (currency_id, aed_per_unit, effective_at, entered_by)
         VALUES ((SELECT id FROM currencies WHERE code = 'AED'), 1, now(), $1)`,
        [fixture.userId],
      );
      const catalogId = await insert(`INSERT INTO catalogs (owner_id, title) VALUES ($1, $2)`, [
        fixture.userId,
        name,
      ]);
      const versionId = await insert(
        `INSERT INTO catalog_versions (catalog_id, version_no, snapshot, exchange_rate_id, requested_by)
         VALUES ($1, 1, '{}', $2, $3)`,
        [catalogId, rateId, requesterId],
      );
      return { requesterId, rateId, catalogId, versionId };
    };

    const versionExists = async (versionId: string) => {
      const { rows } = await migrated.query('SELECT 1 FROM catalog_versions WHERE id = $1', [
        versionId,
      ]);
      return rows.length === 1;
    };

    it('BR-11 FR-CAT-06 deleting an exchange rate used by a version fails', async () => {
      const { rateId, versionId } = await createCatalogVersion('used-rate');
      await expect(
        migrated.query('DELETE FROM exchange_rates WHERE id = $1', [rateId]),
      ).rejects.toMatchObject({ constraint: 'catalog_versions_exchange_rate_id_fk' });
      expect(await versionExists(versionId)).toBe(true);
    });

    it('BR-11 FR-CAT-06 deleting the user who requested a version fails', async () => {
      const { requesterId, versionId } = await createCatalogVersion('used-user');
      await expect(
        migrated.query('DELETE FROM users WHERE id = $1', [requesterId]),
      ).rejects.toMatchObject({ constraint: 'catalog_versions_requested_by_fk' });
      expect(await versionExists(versionId)).toBe(true);
    });

    it('deleting a catalog still deletes its versions', async () => {
      const { catalogId, versionId } = await createCatalogVersion('deleted-catalog');
      await migrated.query('DELETE FROM catalogs WHERE id = $1', [catalogId]);
      expect(await versionExists(versionId)).toBe(false);
    });
  });

  it('withUser rolls back everything when fn throws', async () => {
    const unitId = await createUnit('with-user-rollback');
    await expect(
      database.withUser(fixture.userId, async (tx) => {
        await tx.execute(sql`UPDATE units SET price_aed = 2 WHERE id = ${unitId}`);
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');

    const { rows } = await migrated.query('SELECT price_aed FROM units WHERE id = $1', [unitId]);
    expect(rows).toEqual([{ price_aed: '1000000.00' }]);
    expect(await historyOf(unitId)).toEqual([]);
  });

  it('withUser sets the acting user only for its own transaction', async () => {
    const read = `SELECT current_setting('reih.user_id', true) AS value`;
    const inside = await database.withUser(fixture.userId, (tx) => tx.execute(sql.raw(read)));
    expect(inside.rows).toEqual([{ value: fixture.userId }]);

    // After a local setting ends, PostgreSQL reports an empty string on that connection.
    const after = await servicePool.query(read);
    expect(after.rows).toEqual([{ value: '' }]);
  });
});
