import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// pnpm db:migrate runs from apps/api. A DATABASE_URL already in the environment wins.
const ENV_FILE = '../../.env';
if (!process.env.DATABASE_URL && existsSync(ENV_FILE)) {
  process.loadEnvFile(ENV_FILE);
}

export default defineConfig({
  dialect: 'postgresql',
  // fk-targets.ts stays out on purpose: its stand-ins must not become tables.
  schema: [
    './src/shared/database/enums.ts',
    './src/modules/*/infrastructure/*.schema.ts',
    './src/shared/audit/audit.schema.ts',
  ],
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
