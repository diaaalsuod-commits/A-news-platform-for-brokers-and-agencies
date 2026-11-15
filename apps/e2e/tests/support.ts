import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { type Browser, expect, type Page } from '@playwright/test';
import { messages } from '@reih/i18n';

export const MAILPIT_API = `${process.env.MAILPIT_URL ?? 'http://localhost:8025'}/api/v1`;
const REPO_ROOT = resolve(import.meta.dirname, '../../..');
const en = messages.en;

/** The password every account activated by the e2e tests gets. */
export const PASSWORD = 'e2e-password-long-1';
export const OPS = 'https://ops.localhost';

export async function logIn(page: Page, app: string, email: string, password = PASSWORD) {
  await page.goto(`${app}/en/login`);
  await page.getByLabel(en.auth.login.email).fill(email);
  await page.getByLabel(en.auth.login.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: en.auth.login.submit }).click();
  await expect(page).toHaveURL(`${app}/en`);
}

/** Opens the emailed link in a fresh browser, sets the password and logs in. */
export async function activateAndLogIn(browser: Browser, email: string): Promise<Page> {
  const link = await activationLinkFor(email);
  const page = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await page.goto(link);
  await page.getByLabel(en.auth.activate.password, { exact: true }).fill(PASSWORD);
  await page.getByLabel(en.auth.activate.confirmPassword).fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: en.auth.activate.submit }).click();
  await expect(page).toHaveURL(/\/en\/login\?done=activated$/);
  await logIn(page, new URL(link).origin, email);
  return page;
}

/** Collects every message next-intl could not find, from the browser console. */
export function watchMissingMessages(page: Page): string[] {
  const missing: string[] = [];
  page.on('console', (message) => {
    if (/MISSING_MESSAGE|INSUFFICIENT_PATH/.test(message.text())) missing.push(message.text());
  });
  return missing;
}

/** Switches with the header button, which also saves the choice (FR-ACC-06). */
export async function switchToArabic(page: Page) {
  await page.getByRole('button', { name: en.common.languageName.ar }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
}

/**
 * A fresh invited Agency Admin, through the e2e:invite command (InvitationService in a Nest
 * application context; never an HTTP endpoint). The API's dev build provides dist/cli.
 */
export function inviteAgencyAdmin(language: 'en' | 'ar' = 'en'): { email: string } {
  const output = execSync(`pnpm --silent --filter @reih/api e2e:invite --language ${language}`, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const line = output.split('\n').find((entry) => entry.startsWith('E2E_INVITE '));
  if (!line) {
    throw new Error(`e2e:invite printed no result:\n${output}`);
  }
  return JSON.parse(line.slice('E2E_INVITE '.length)) as { email: string };
}

/** The activation link of the latest invitation email to this address, from Mailpit. */
export async function activationLinkFor(email: string): Promise<string> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const query = encodeURIComponent(`to:"${email}"`);
        const found = (await (await fetch(`${MAILPIT_API}/search?query=${query}`)).json()) as {
          messages: { ID: string }[];
        };
        id = found.messages[0]?.ID;
        return id;
      },
      { timeout: 20_000, message: `an invitation email to ${email}` },
    )
    .toBeTruthy();
  const message = (await (await fetch(`${MAILPIT_API}/message/${id}`)).json()) as {
    Text: string;
  };
  const link = /https:\/\/\S+\/activate#token=[A-Za-z0-9_-]{43}/.exec(message.Text)?.[0];
  expect(link, 'the invitation email carries an activation link').toBeTruthy();
  return link as string;
}

/**
 * A fresh, active Platform Admin with a random password, through the e2e:platform-admin command
 * (local stacks only; never an HTTP endpoint).
 */
export function createPlatformAdmin(): { email: string; password: string } {
  const output = execSync('pnpm --silent --filter @reih/api e2e:platform-admin', {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const line = output.split('\n').find((entry) => entry.startsWith('E2E_PLATFORM_ADMIN '));
  if (!line) {
    throw new Error(`e2e:platform-admin printed no result:\n${output}`);
  }
  return JSON.parse(line.slice('E2E_PLATFORM_ADMIN '.length)) as {
    email: string;
    password: string;
  };
}

/**
 * A fresh, active Data Operator through the real invitation flow (FR-ADM-03): a new Platform
 * Admin invites them on the Staff screen, and they activate from the Mailpit email and log in to
 * the Operations Dashboard. Returns the Data Operator's page and the Platform Admin's.
 */
export async function createDataOperator(
  browser: Browser,
): Promise<{ operator: Page; admin: Page; email: string }> {
  const email = `e2e-operator-${Date.now()}@reih.test`;
  const credentials = createPlatformAdmin();
  const admin = await (await browser.newContext({ ignoreHTTPSErrors: true })).newPage();
  await logIn(admin, OPS, credentials.email, credentials.password);
  await admin.goto(`${OPS}/en/staff`);
  await admin.getByLabel(en.invitations.columns.email, { exact: true }).fill(email);
  await admin
    .getByLabel(en.invitations.columns.role, { exact: true })
    .selectOption('data_operator');
  await admin.getByRole('button', { name: en.admin.staff.invite.submit }).click();
  await expect(admin.getByRole('status').filter({ hasText: email })).toBeVisible();
  const operator = await activateAndLogIn(browser, email);
  return { operator, admin, email };
}

/**
 * A state-changing API call with this page's session and a CSRF token, for a step whose button
 * comes in a later part (archiving a project arrives with the publish screens, P4.4 part d) or
 * for Platform Admin set-up the test does not exercise.
 */
export async function apiCall(
  page: Page,
  method: 'post' | 'patch',
  path: string,
  data?: object,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const origin = new URL(page.url()).origin;
  const csrf = await page.request.get(`${origin}/api/v1/auth/csrf`);
  expect(csrf.status(), 'a CSRF token').toBe(200);
  const { token } = (await csrf.json()) as { token: string };
  const response = await page.request[method](`${origin}/api/v1${path}`, {
    headers: { 'x-csrf-token': token },
    data: data ?? {},
  });
  return { status: response.status(), body: (await response.json()) as Record<string, unknown> };
}

/** The map style the screens use (packages/ui/src/map/tiles.ts). */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const MAP_STYLE_PATTERN = /^https:\/\/tiles\.openfreemap\.org\/styles\/liberty/;

/**
 * Serves a minimal style instead of OpenFreeMap's, so a map works with no network: a background
 * layer and no tiles. A click still gives a point, so the map-picker tests do not depend on
 * tiles.openfreemap.org.
 */
export async function useLocalMapStyle(page: Page) {
  await page.unroute(MAP_STYLE_PATTERN);
  await page.route(MAP_STYLE_PATTERN, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({
        version: 8,
        name: 'e2e-local',
        sources: {},
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#e6eef0' } },
        ],
      }),
    }),
  );
}

/** Makes the map style unreachable, as a network failure would. */
export async function failMapStyle(page: Page) {
  await page.unroute(MAP_STYLE_PATTERN);
  await page.route(MAP_STYLE_PATTERN, (route) => route.abort('internetdisconnected'));
}

/** Back to the real style on the real network. */
export async function useRealMapStyle(page: Page) {
  await page.unroute(MAP_STYLE_PATTERN);
}
