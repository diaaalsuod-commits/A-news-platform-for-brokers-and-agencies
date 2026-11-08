import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAppUrls } from '@reih/config/next/app-urls';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('loadAppUrls (next.config.ts of both web apps)', () => {
  let dir: string;
  const saved = { ...process.env };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'reih-env-'));
    delete process.env.APP_URL;
    delete process.env.OPS_URL;
    delete process.env.DATABASE_URL;
    delete process.env.URL_SIGNING_SECRET;
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    process.env = { ...saved };
  });

  const envFile = (text: string) => {
    const file = join(dir, '.env');
    writeFileSync(file, text);
    return file;
  };

  it('NFR-10 takes only APP_URL and OPS_URL from the root .env, never a server secret', () => {
    loadAppUrls(
      envFile(
        [
          'APP_URL=https://app.localhost',
          'OPS_URL=https://ops.localhost',
          'DATABASE_URL=postgres://user:secret@localhost/reih',
          'URL_SIGNING_SECRET=do-not-leak-this-value',
        ].join('\n'),
      ),
    );
    expect(process.env.APP_URL).toBe('https://app.localhost');
    expect(process.env.OPS_URL).toBe('https://ops.localhost');
    expect(process.env.DATABASE_URL).toBeUndefined();
    expect(process.env.URL_SIGNING_SECRET).toBeUndefined();
  });

  it('a variable already set in the environment wins over the file', () => {
    process.env.APP_URL = 'https://broker.example.test';
    loadAppUrls(envFile('APP_URL=https://app.localhost\nOPS_URL=https://ops.localhost'));
    expect(process.env.APP_URL).toBe('https://broker.example.test');
    expect(process.env.OPS_URL).toBe('https://ops.localhost');
  });

  it('does nothing when there is no .env file', () => {
    expect(() => loadAppUrls(join(dir, 'missing.env'))).not.toThrow();
    expect(process.env.APP_URL).toBeUndefined();
  });
});
