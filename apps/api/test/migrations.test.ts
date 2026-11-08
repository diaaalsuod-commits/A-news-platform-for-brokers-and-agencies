import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS = join(import.meta.dirname, '../drizzle');

describe('migration files', () => {
  // drizzle-kit quotes custom types, and PostgreSQL has no type named "geography(Point,4326)".
  // After pnpm db:generate, remove the quotes from the new migration before it is applied.
  it('do not quote a geography type', () => {
    const files = readdirSync(MIGRATIONS).filter((file) => file.endsWith('.sql'));
    expect(files.length).toBeGreaterThan(0);

    const offenders = files.filter((file) =>
      readFileSync(join(MIGRATIONS, file), 'utf8').includes('"geography('),
    );
    expect(offenders).toEqual([]);
  });

  // An amenity or a unit tag in use must refuse deletion instead of silently losing its links.
  it('FR-ADM-04 migration 0003 makes the amenity and unit tag links restrict a delete', () => {
    const sql = readFileSync(join(MIGRATIONS, '0003_reference_restrict.sql'), 'utf8');
    expect(sql).toMatch(/"project_amenities_amenity_id_fk"[^;]*ON DELETE restrict/);
    expect(sql).toMatch(/"unit_tag_links_unit_tag_id_fk"[^;]*ON DELETE restrict/);
  });
});
