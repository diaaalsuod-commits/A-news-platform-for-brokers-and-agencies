import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests on the full local stack, through Caddy (docs/decisions.md: local only for now).
 * Before `pnpm e2e`: docker compose up -d, pnpm db:migrate, a root .env, and once
 * `pnpm --filter @reih/e2e exec playwright install chromium`. A running `pnpm dev` is reused;
 * otherwise it is started.
 */
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  reporter: [['list']],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'https://app.localhost',
    // Caddy's own local certificate authority (tls internal).
    ignoreHTTPSErrors: true,
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm dev',
    cwd: '../..',
    url: 'https://app.localhost/api/v1/health',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
