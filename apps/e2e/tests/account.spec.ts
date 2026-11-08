import { expect, type Page, test } from '@playwright/test';
import { messages } from '@reih/i18n';
import { activationLinkFor, inviteAgencyAdmin } from './support';

const en = messages.en;
const ar = messages.ar;
const PASSWORD = 'e2e-password-long-1';

const BROKER = 'https://app.localhost';
const OPS = 'https://ops.localhost';

async function expectLanguage(page: Page, lang: 'ar' | 'en') {
  await expect(page.locator('html')).toHaveAttribute('lang', lang);
  await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
}

async function logIn(page: Page, email: string, copy: typeof en | typeof ar) {
  await page.getByLabel(copy.auth.login.email).fill(email);
  await page.getByLabel(copy.auth.login.password, { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: copy.auth.login.submit }).click();
}

const storedToken = (page: Page) =>
  page.evaluate(() => sessionStorage.getItem('reih.activate.token'));

test.describe.serial('accounts: activation, login, language', () => {
  let email: string;
  let link: string;

  test('FR-ACC-01 FR-ACC-02 FR-ACC-06 activate, log in, switch to Arabic, log out, and Arabic stays', async ({
    page,
  }) => {
    ({ email } = inviteAgencyAdmin('en'));
    link = await activationLinkFor(email);
    expect(link.startsWith(`${BROKER}/en/activate#token=`)).toBe(true);

    // Activate: the token is read from the fragment and removed from the address bar.
    await page.goto(link);
    await expect(page.getByRole('heading', { name: en.auth.activate.title })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    expect(new URL(page.url()).hash).toBe('');
    expect(page.url()).not.toContain('token');

    await page.getByLabel(en.auth.activate.password, { exact: true }).fill(PASSWORD);
    await page.getByLabel(en.auth.activate.confirmPassword).fill(PASSWORD);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: en.auth.activate.submit }).click();

    await expect(page).toHaveURL(`${BROKER}/en/login?done=activated`);
    await expect(page.getByText(en.auth.login.activated)).toBeVisible();
    // A used link's token does not stay behind in the tab.
    expect(await storedToken(page)).toBeNull();

    // Log in: an Agency Admin's home is the Broker Web App.
    await logIn(page, email, en);
    await expect(page).toHaveURL(`${BROKER}/en`);
    await expect(page.getByRole('heading', { name: en.home.welcomeNoName })).toBeVisible();
    await expectLanguage(page, 'en');

    // Switch to Arabic on the profile screen: same screen, right to left, saved.
    await page.getByRole('link', { name: en.nav.profile }).click();
    await expect(page.getByRole('heading', { name: en.profile.title })).toBeVisible();
    await page.getByRole('button', { name: en.common.languageName.ar }).click();
    await expect(page).toHaveURL(`${BROKER}/ar/profile`);
    await expectLanguage(page, 'ar');
    await expect(page.getByRole('heading', { name: ar.profile.title })).toBeVisible();

    // Log out: the login page stays in Arabic.
    await page.getByRole('button', { name: ar.nav.logout }).click();
    await expect(page).toHaveURL(`${BROKER}/ar/login`);
    await expectLanguage(page, 'ar');
    await expect(page.getByRole('heading', { name: ar.auth.login.title })).toBeVisible();

    // Log in again: still Arabic, and the choice is saved on the account.
    await logIn(page, email, ar);
    await expect(page).toHaveURL(`${BROKER}/ar`);
    await expectLanguage(page, 'ar');
    await expect(page.getByRole('heading', { name: ar.home.welcomeNoName })).toBeVisible();
    const me = (await (await page.request.get(`${BROKER}/api/v1/me`)).json()) as {
      preferences: { language: string };
    };
    expect(me.preferences.language).toBe('ar');
  });

  test('FR-ACC-01 a used link is refused with its message, and its token is forgotten', async ({
    page,
  }) => {
    await page.goto(link);
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(en.errors.INVITATION_USED);
    expect(new URL(page.url()).hash).toBe('');
    await expect.poll(() => storedToken(page)).toBeNull();
  });

  test('FR-ACC-06 after login the saved language wins over the browser and the address', async ({
    browser,
  }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US' });
    const page = await context.newPage();
    await page.goto(`${BROKER}/en/login`);
    await expectLanguage(page, 'en');
    await logIn(page, email, en);
    await expect(page).toHaveURL(`${BROKER}/ar`);
    await expectLanguage(page, 'ar');
    await context.close();
  });

  test('FR-ACC-06 before login the language follows the browser, falling back to English', async ({
    browser,
  }) => {
    for (const [locale, expected] of [
      ['ar-AE', 'ar'],
      ['fr-FR', 'en'],
    ] as const) {
      const context = await browser.newContext({ ignoreHTTPSErrors: true, locale });
      const page = await context.newPage();
      await page.goto(`${BROKER}/`);
      // Home needs a login, so it opens the login page, remembering where the user was going.
      await expect(page).toHaveURL(new RegExp(`/${expected}/login\\?next=`));
      await expectLanguage(page, expected);
      await context.close();
    }
  });

  test('FR-ACC-04 an Agency Admin on the Operations Dashboard gets "no access" with a link to the right app', async ({
    browser,
  }) => {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US' });
    const page = await context.newPage();
    await page.goto(`${OPS}/en/login`);
    await logIn(page, email, en);
    await expect(page).toHaveURL(`${OPS}/en/no-access`);
    await expect(page.getByRole('heading', { name: en.noAccess.title })).toBeVisible();
    await expect(page.getByRole('link', { name: /REIH Broker/ })).toHaveAttribute(
      'href',
      `${BROKER}/en/login`,
    );
    // The session made on the wrong app was ended at once.
    expect((await page.request.get(`${OPS}/api/v1/me`)).status()).toBe(401);
    await context.close();
  });

  test('SRS 3.1 a wrong password shows the localized API message, never a code', async ({
    page,
  }) => {
    await page.goto(`${BROKER}/ar/login`);
    await page.getByLabel(ar.auth.login.email).fill(email);
    await page.getByLabel(ar.auth.login.password, { exact: true }).fill('wrong-password-1');
    await page.getByRole('button', { name: ar.auth.login.submit }).click();
    // Inside <main>: Next.js adds its own empty role="alert" route announcer outside it.
    await expect(page.getByRole('main').getByRole('alert')).toHaveText(
      ar.errors.INVALID_CREDENTIALS,
    );
    await expect(page.getByText('INVALID_CREDENTIALS')).toHaveCount(0);
  });
});
