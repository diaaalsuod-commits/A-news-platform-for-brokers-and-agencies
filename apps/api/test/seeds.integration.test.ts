import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { verify } from '@node-rs/argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeedCommand } from '../src/cli/seed-commands.js';
import { readSeedReferences } from '../src/modules/admin/index.js';
import {
  FULL_LOAD_SIZE,
  type LoadSeedSize,
  planUnitCounts,
  seedLoadContent,
} from '../src/modules/content/index.js';
import { ensureSeedOperator } from '../src/modules/identity/index.js';
import { type Env, parseEnv } from '../src/shared/config/index.js';
import { FileStorage } from '../src/shared/files/index.js';

const MIGRATIONS = join(import.meta.dirname, '../drizzle');
const ADMIN_PASSWORD = 'a-long-test-password';
const SMALL_LOAD: LoadSeedSize = { projects: 25, units: 2_000, largeProjects: 2, developers: 5 };
// A check, not a promise that no other company shares an invented name.
const WELL_KNOWN_DEVELOPERS =
  /emaar|damac|nakheel|aldar|sobha|meraas|deyaar|azizi|danube|binghatti|ellington|omniyat|select group|geniemap/i;

describe('seeds', () => {
  let container: StartedPostgreSqlContainer;
  let admin: pg.Pool;
  let filesDir: string;
  const pools: pg.Pool[] = [];

  /** An empty, migrated database of its own, and an environment that points at it. */
  const newDatabase = async (name: string, overrides: Record<string, string> = {}) => {
    await admin.query(`CREATE DATABASE ${name}`);
    const url = new URL(container.getConnectionUri());
    url.pathname = `/${name}`;
    const pool = new pg.Pool({ connectionString: url.toString() });
    pools.push(pool);
    await migrate(drizzle({ client: pool }), { migrationsFolder: MIGRATIONS });
    const env = parseEnv({
      NODE_ENV: 'test',
      API_PORT: '4000',
      LOG_LEVEL: 'silent',
      DATABASE_URL: url.toString(),
      REDIS_URL: 'redis://localhost:6379',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_FROM: 'REIH <no-reply@example.test>',
      FILES_DIR: join(filesDir, name),
      URL_SIGNING_SECRET: 'a-test-secret-of-at-least-32-characters',
      APP_URL: 'https://app.localhost',
      OPS_URL: 'https://ops.localhost',
      ...overrides,
    });
    return { pool, env };
  };

  const count = async (pool: pg.Pool, sql: string, values: unknown[] = []) => {
    const { rows } = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${sql}`,
      values,
    );
    return rows[0]?.count;
  };

  /** Every row of every table, including updated_at, as one value per table. */
  const snapshot = async (pool: pg.Pool) => {
    const { rows } = await pool.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'spatial_ref_sys'
       ORDER BY 1`,
    );
    const tables: Record<string, string> = {};
    for (const { relname } of rows) {
      const result = await pool.query<{ digest: string }>(
        `SELECT count(*) || ':' || coalesce(md5(string_agg(t::text, '|' ORDER BY t::text)), '') AS digest
         FROM "${relname}" t`,
      );
      tables[relname] = result.rows[0]?.digest ?? '';
    }
    return tables;
  };

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    admin = new pg.Pool({ connectionString: container.getConnectionUri() });
    filesDir = mkdtempSync(join(tmpdir(), 'reih-seeds-'));
  });

  afterAll(async () => {
    await Promise.all([...pools.map((pool) => pool.end()), admin?.end()]);
    await container?.stop();
    rmSync(filesDir, { recursive: true, force: true });
  });

  describe('reference data', () => {
    let pool: pg.Pool;
    let env: Env;

    beforeAll(async () => {
      ({ pool, env } = await newDatabase('seed_reference'));
      await runSeedCommand('reference', env);
    });

    it('running it twice changes nothing', async () => {
      const before = await snapshot(pool);
      await runSeedCommand('reference', env);
      expect(await snapshot(pool)).toEqual(before);
    });

    it('FR-LOC-01 AED is enabled, and USD, EUR, GBP and SAR are disabled', async () => {
      const { rows } = await pool.query(
        'SELECT trim(code) AS code, is_enabled FROM currencies ORDER BY code',
      );
      expect(rows).toEqual([
        { code: 'AED', is_enabled: true },
        { code: 'EUR', is_enabled: false },
        { code: 'GBP', is_enabled: false },
        { code: 'SAR', is_enabled: false },
        { code: 'USD', is_enabled: false },
      ]);
    });

    it('FR-FLT-07 layouts go from studio to 6+ bedrooms', async () => {
      const { rows } = await pool.query('SELECT bedrooms FROM layouts ORDER BY sort_order');
      expect(rows.map(({ bedrooms }) => bedrooms)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });

    it('FR-FLT-08 unit levels are simplex, duplex, triplex and loft', async () => {
      const { rows } = await pool.query('SELECT code FROM unit_levels ORDER BY sort_order');
      expect(rows.map(({ code }) => code)).toEqual(['simplex', 'duplex', 'triplex', 'loft']);
    });

    it('fills each list', async () => {
      expect(await count(pool, 'property_types')).toBe(5);
      expect(await count(pool, 'furnishing_types')).toBe(3);
      expect(await count(pool, 'unit_tags')).toBe(6);
      expect(await count(pool, 'amenity_categories')).toBe(6);
      expect(await count(pool, 'amenities')).toBeGreaterThanOrEqual(18);
    });

    it.each([
      'currencies',
      'property_types',
      'layouts',
      'unit_levels',
      'furnishing_types',
      'unit_tags',
      'amenity_categories',
      'amenities',
      'areas',
    ])('FR-LOC-03 every row of %s has an Arabic and an English name', async (table) => {
      expect(await count(pool, `${table} WHERE trim(name_ar) = '' OR trim(name_en) = ''`)).toBe(0);
      // The Arabic name really is in Arabic script.
      expect(await count(pool, `${table} WHERE name_ar !~ '[؀-ۿ]'`)).toBe(0);
    });

    it('FR-LOC-04 has the 7 emirates and at least 3 communities each, all in the UAE', async () => {
      expect(await count(pool, `areas WHERE level = 'emirate'`)).toBe(7);
      expect(await count(pool, `areas WHERE country_code <> 'AE'`)).toBe(0);
      const { rows } = await pool.query(
        `SELECT e.name_en, count(c.id)::int AS communities
         FROM areas e LEFT JOIN areas c ON c.parent_id = e.id
         WHERE e.level = 'emirate' GROUP BY e.name_en`,
      );
      expect(rows.every(({ communities }) => communities >= 3)).toBe(true);
    });

    it('FR-DAT-03 every center point is inside the UAE bounding box', async () => {
      expect(
        await count(
          pool,
          `areas WHERE ST_X(center::geometry) NOT BETWEEN 51.5 AND 56.5
             OR ST_Y(center::geometry) NOT BETWEEN 22.6 AND 26.1`,
        ),
      ).toBe(0);
    });

    it('keeps the single settings row, and restores it if it is gone', async () => {
      expect(await count(pool, 'settings')).toBe(1);
      await pool.query('DELETE FROM settings');
      await runSeedCommand('reference', env);
      expect(await count(pool, 'settings')).toBe(1);
    });

    it('leaves alone a row an admin has edited', async () => {
      await pool.query(`UPDATE property_types SET name_en = 'Flat' WHERE code = 'apartment'`);
      await runSeedCommand('reference', env);
      const { rows } = await pool.query(
        `SELECT name_en FROM property_types WHERE code = 'apartment'`,
      );
      expect(rows).toEqual([{ name_en: 'Flat' }]);
    });
  });

  describe('first Platform Admin', () => {
    const adminEnv = {
      FIRST_ADMIN_EMAIL: 'owner@example.test',
      FIRST_ADMIN_PASSWORD: ADMIN_PASSWORD,
    };

    it('SRS 2.5 creates an active Platform Admin with an Argon2id hash', async () => {
      const { pool, env } = await newDatabase('seed_admin_ok', adminEnv);
      await runSeedCommand('admin', env);

      const { rows } = await pool.query(
        `SELECT email, role, status, password_hash, agency_id FROM users`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        email: 'owner@example.test',
        role: 'platform_admin',
        status: 'active',
        agency_id: null,
      });
      expect(rows[0].password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(rows[0].password_hash).not.toContain(ADMIN_PASSWORD);
      await expect(verify(rows[0].password_hash, ADMIN_PASSWORD)).resolves.toBe(true);
    });

    it('SRS 2.5 refuses when a Platform Admin already exists, and changes nothing', async () => {
      const { pool, env } = await newDatabase('seed_admin_twice', adminEnv);
      await runSeedCommand('admin', env);
      const before = await snapshot(pool);

      await expect(
        runSeedCommand('admin', { ...env, FIRST_ADMIN_EMAIL: 'another@example.test' }),
      ).rejects.toMatchObject({ name: 'SeedRefused', message: /already exists/ });
      expect(await snapshot(pool)).toEqual(before);
    });

    it('refuses when the variables are missing', async () => {
      const { pool, env } = await newDatabase('seed_admin_missing');
      await expect(runSeedCommand('admin', env)).rejects.toMatchObject({ name: 'SeedRefused' });
      expect(await count(pool, 'users')).toBe(0);
    });

    it('FR-ACC-01 refuses a password under 10 characters', async () => {
      const { pool, env } = await newDatabase('seed_admin_short', {
        FIRST_ADMIN_EMAIL: 'owner@example.test',
        FIRST_ADMIN_PASSWORD: 'too-short',
      });
      await expect(runSeedCommand('admin', env)).rejects.toMatchObject({ name: 'SeedRefused' });
      expect(await count(pool, 'users')).toBe(0);
    });

    it('refuses an email that another user has', async () => {
      const { env } = await newDatabase('seed_admin_taken', {
        FIRST_ADMIN_EMAIL: 'system-seed@reih.localhost',
        FIRST_ADMIN_PASSWORD: ADMIN_PASSWORD,
      });
      await runSeedCommand('demo', env);
      await expect(runSeedCommand('admin', env)).rejects.toMatchObject({
        message: /another user/,
      });
    });
  });

  describe('demo data', () => {
    let pool: pg.Pool;
    let env: Env;

    beforeAll(async () => {
      ({ pool, env } = await newDatabase('seed_demo'));
      await runSeedCommand('demo', env);
    });

    it('running it twice changes nothing, and writes no new files', async () => {
      const files = () => readdirSync(join(env.FILES_DIR, 'seed/demo')).sort();
      const [beforeRows, beforeFiles] = [await snapshot(pool), files()];
      await runSeedCommand('demo', env);
      expect(await snapshot(pool)).toEqual(beforeRows);
      expect(files()).toEqual(beforeFiles);
    });

    it('D-02 has exactly 30 published projects, and every one has units', async () => {
      expect(await count(pool, `projects WHERE status = 'published'`)).toBe(30);
      expect(await count(pool, 'projects')).toBe(30);
      expect(
        await count(
          pool,
          'projects p WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.project_id = p.id)',
        ),
      ).toBe(0);
    });

    it('FR-DAT-05 every project is complete enough to be published', async () => {
      expect(
        await count(
          pool,
          `projects p WHERE last_verified_at IS NULL
             OR (stage <> 'ready' AND (handover_quarter IS NULL OR handover_year IS NULL))
             OR ST_X(location::geometry) NOT BETWEEN 51.5 AND 56.5
             OR ST_Y(location::geometry) NOT BETWEEN 22.6 AND 26.1
             OR NOT EXISTS (
               SELECT 1 FROM media_files m
               WHERE m.project_id = p.id AND m.type = 'image' AND m.license_note <> ''
             )`,
        ),
      ).toBe(0);
    });

    it('FR-PRJ-09 upcoming projects have an expected launch date', async () => {
      expect(await count(pool, `projects WHERE stage = 'upcoming'`)).toBeGreaterThan(0);
      expect(
        await count(pool, `projects WHERE stage = 'upcoming' AND expected_launch_date IS NULL`),
      ).toBe(0);
    });

    it('FR-PRJ-03 some projects are past the stale threshold, and most are not', async () => {
      const stale = await count(
        pool,
        `projects WHERE last_verified_at < now() - interval '14 days'`,
      );
      expect(stale).toBeGreaterThan(0);
      expect(stale).toBeLessThan(15);
    });

    it('BR-02 every payment plan totals exactly 100%, with one default per project', async () => {
      const { rows } = await pool.query(
        `SELECT p.id, sum(m.percentage) AS total
         FROM payment_plans p JOIN payment_plan_milestones m ON m.plan_id = p.id GROUP BY p.id`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(30);
      expect(rows.every(({ total }) => Number(total) === 100)).toBe(true);
      expect(await count(pool, 'payment_plans WHERE is_default')).toBe(30);
    });

    it('BR-14 D-02 every image is a real PNG with the license note "self-produced"', async () => {
      const { rows } = await pool.query<{ file_path: string; size_bytes: string }>(
        `SELECT file_path, size_bytes FROM media_files`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(30);
      expect(await count(pool, `media_files WHERE license_note <> 'self-produced'`)).toBe(0);
      expect(await count(pool, `media_files WHERE trim(source_note) = ''`)).toBe(0);

      for (const { file_path: path, size_bytes: size } of rows) {
        const content = readFileSync(join(env.FILES_DIR, path));
        expect(content.subarray(1, 4).toString('latin1')).toBe('PNG');
        expect(content.length).toBe(Number(size));
      }
    });

    it('BR-15 no developer has the name of a well-known company', async () => {
      const { rows } = await pool.query<{ text: string }>(
        `SELECT name_en AS text FROM developers
         UNION ALL SELECT description_en FROM developers
         UNION ALL SELECT name_en FROM projects`,
      );
      expect(rows.filter(({ text }) => WELL_KNOWN_DEVELOPERS.test(text))).toEqual([]);
    });

    it('content belongs to System seed, a deactivated user who cannot log in', async () => {
      const { rows } = await pool.query(
        `SELECT full_name, role, status, password_hash FROM users
         WHERE email = 'system-seed@reih.localhost'`,
      );
      expect(rows).toEqual([
        {
          full_name: 'System seed',
          role: 'data_operator',
          status: 'deactivated',
          password_hash: null,
        },
      ]);
      expect(
        await count(
          pool,
          `projects p JOIN users u ON u.id = p.created_by
           WHERE u.email <> 'system-seed@reih.localhost'`,
        ),
      ).toBe(0);
    });

    it('FR-LOC-01 enables USD, EUR, GBP and SAR, each with a rate marked as a demo value', async () => {
      const { rows } = await pool.query(
        `SELECT trim(c.code) AS code, c.is_enabled, a.reason
         FROM currencies c
           JOIN exchange_rates r ON r.currency_id = c.id
           JOIN audit_logs a ON a.entity_id = r.id AND a.entity_type = 'exchange_rates'
         ORDER BY code`,
      );
      expect(rows.map(({ code }) => code)).toEqual(['EUR', 'GBP', 'SAR', 'USD']);
      expect(rows.every(({ is_enabled: enabled }) => enabled)).toBe(true);
      expect(rows.every(({ reason }) => /demo values/i.test(reason))).toBe(true);
      expect(await count(pool, 'exchange_rates')).toBe(4);
    });

    it('does not enable again a currency an admin has disabled since', async () => {
      await pool.query(`UPDATE currencies SET is_enabled = false WHERE code = 'GBP'`);
      await runSeedCommand('demo', env);
      const { rows } = await pool.query(`SELECT is_enabled FROM currencies WHERE code = 'GBP'`);
      expect(rows).toEqual([{ is_enabled: false }]);
      await pool.query(`UPDATE currencies SET is_enabled = true WHERE code = 'GBP'`);
    });
  });

  describe('load data', () => {
    let pool: pg.Pool;
    let env: Env;

    beforeAll(async () => {
      ({ pool, env } = await newDatabase('seed_small_load'));
      await runSeedCommand('load', env, { loadSize: SMALL_LOAD });
    });

    it('running it twice changes nothing', async () => {
      const before = await snapshot(pool);
      await runSeedCommand('load', env, { loadSize: SMALL_LOAD });
      expect(await snapshot(pool)).toEqual(before);
    });

    it('NFR-05 creates exactly the requested projects and units, all published', async () => {
      expect(await count(pool, `projects WHERE status = 'published'`)).toBe(SMALL_LOAD.projects);
      expect(await count(pool, 'projects')).toBe(SMALL_LOAD.projects);
      expect(await count(pool, 'units')).toBe(SMALL_LOAD.units);
    });

    it('NFR-03 the large projects have exactly 500 units', async () => {
      const { rows } = await pool.query(
        `SELECT count(*)::int AS units FROM units GROUP BY project_id HAVING count(*) = 500`,
      );
      expect(rows).toHaveLength(SMALL_LOAD.largeProjects);
    });

    it('FR-DAT-05 every project has a licensed image and a verification', async () => {
      expect(
        await count(
          pool,
          `projects p WHERE p.last_verified_at IS NULL
             OR NOT EXISTS (SELECT 1 FROM media_files m
               WHERE m.project_id = p.id AND m.license_note = 'self-produced')
             OR NOT EXISTS (SELECT 1 FROM project_verifications v WHERE v.project_id = p.id)`,
        ),
      ).toBe(0);
    });

    it('BR-02 every project has one default plan totalling 100%, amenities and a contact', async () => {
      const { rows } = await pool.query(
        `SELECT sum(m.percentage) AS total FROM payment_plans p
         JOIN payment_plan_milestones m ON m.plan_id = p.id WHERE p.is_default GROUP BY p.id`,
      );
      expect(rows).toHaveLength(SMALL_LOAD.projects);
      expect(rows.every(({ total }) => Number(total) === 100)).toBe(true);
      expect(await count(pool, 'project_sales_contacts')).toBe(SMALL_LOAD.projects);
      expect(
        await count(
          pool,
          'projects p WHERE NOT EXISTS (SELECT 1 FROM project_amenities a WHERE a.project_id = p.id)',
        ),
      ).toBe(0);
    });

    it('all projects share one image file on disk', () => {
      expect(readdirSync(join(env.FILES_DIR, 'seed/load'))).toHaveLength(1);
    });

    it('spreads the projects over several emirates', async () => {
      const { rows } = await pool.query(
        `SELECT count(DISTINCT c.parent_id)::int AS emirates
         FROM projects p JOIN areas c ON c.id = p.community_id`,
      );
      expect(rows[0].emirates).toBeGreaterThanOrEqual(5);
    });

    it('NFR-05 every project sits near the center of its own community', async () => {
      expect(
        await count(
          pool,
          `projects p JOIN areas c ON c.id = p.community_id
           WHERE ST_Distance(p.location, c.center) > 5000`,
        ),
      ).toBe(0);
    });

    it('a stopped run finishes the rest when started again', async () => {
      const { pool: stopped, env: stoppedEnv } = await newDatabase('seed_resume_load');
      const size: LoadSeedSize = { projects: 120, units: 1_200, largeProjects: 0, developers: 3 };
      await runSeedCommand('reference', stoppedEnv);
      const db = drizzle({ client: stopped });

      // Stops after the first transaction of 100 projects, as a crash would.
      await expect(
        seedLoadContent(db, {
          operatorId: await ensureSeedOperator(db),
          references: await readSeedReferences(db),
          storage: new FileStorage(stoppedEnv),
          size,
          onProgress: () => {
            throw new Error('stopped');
          },
        }),
      ).rejects.toThrow('stopped');
      expect(await count(stopped, 'projects')).toBe(100);

      await runSeedCommand('load', stoppedEnv, { loadSize: size });
      expect(await count(stopped, 'projects')).toBe(120);
      expect(await count(stopped, 'units')).toBe(1_200);
      expect(await count(stopped, 'media_files')).toBe(120);
      expect(readdirSync(join(stoppedEnv.FILES_DIR, 'seed/load'))).toHaveLength(1);
    });
  });

  describe('planUnitCounts', () => {
    it('NFR-05 the full size adds up to exactly 250,000 units in 5,000 projects', () => {
      const counts = planUnitCounts(FULL_LOAD_SIZE);
      expect(counts).toHaveLength(5_000);
      expect(counts.reduce((sum, value) => sum + value, 0)).toBe(250_000);
    });

    it('NFR-03 exactly 50 projects have 500 units, and none has more', () => {
      const counts = planUnitCounts(FULL_LOAD_SIZE);
      expect(counts.filter((value) => value === 500)).toHaveLength(50);
      expect(Math.max(...counts)).toBe(500);
      expect(Math.min(...counts)).toBeGreaterThan(0);
    });

    it('refuses a size with too few units for the other projects', () => {
      expect(() =>
        planUnitCounts({ projects: 10, units: 100, largeProjects: 1, developers: 1 }),
      ).toThrow(RangeError);
    });
  });

  describe('guards through the command', () => {
    it('db:seed:load refuses a database not named _load, and writes nothing', async () => {
      const { pool, env } = await newDatabase('seed_guard_plain');
      const before = await snapshot(pool);
      await expect(runSeedCommand('load', env, { loadSize: SMALL_LOAD })).rejects.toMatchObject({
        name: 'SeedRefused',
      });
      expect(await snapshot(pool)).toEqual(before);
    });

    it('db:seed:load refuses in production on a _load database, and writes nothing', async () => {
      const { pool, env } = await newDatabase('seed_guard_prod_load');
      const before = await snapshot(pool);
      await expect(
        runSeedCommand('load', { ...env, NODE_ENV: 'production' }, { loadSize: SMALL_LOAD }),
      ).rejects.toMatchObject({ name: 'SeedRefused' });
      expect(await snapshot(pool)).toEqual(before);
    });

    it('db:seed:demo refuses in production without ALLOW_DEMO_SEED, and writes nothing', async () => {
      const { pool, env } = await newDatabase('seed_guard_prod_demo');
      const before = await snapshot(pool);
      await expect(
        runSeedCommand('demo', { ...env, NODE_ENV: 'production' }),
      ).rejects.toMatchObject({ name: 'SeedRefused' });
      expect(await snapshot(pool)).toEqual(before);
    });

    it('db:seed:demo runs in production with ALLOW_DEMO_SEED=true', async () => {
      const { pool, env } = await newDatabase('seed_guard_prod_allowed');
      await runSeedCommand('demo', { ...env, NODE_ENV: 'production', ALLOW_DEMO_SEED: 'true' });
      expect(await count(pool, 'projects')).toBe(30);
    });
  });
});
