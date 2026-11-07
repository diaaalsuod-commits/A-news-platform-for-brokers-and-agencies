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
});
