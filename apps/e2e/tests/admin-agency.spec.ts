import { type Browser, expect, type Page, test } from '@playwright/test';
import { messages } from '@reih/i18n';
import { activationLinkFor, createPlatformAdmin, inviteAgencyAdmin } from './support';

const en = messages.en;
const PASSWORD = 'e2e-password-long-1';
const BROKER = 'https://app.localhost';
const OPS = 'https://ops.localhost';

async function logIn(page: Page, app: string, email: string, password = PASSWORD) {
  await page.goto(`${app}/en/login`);
  await page.getByLabel(en.auth.login.email).fill(email);
  await page.getByLabel(en.auth.login.password, { exact: true }).fill(password);
  await page.getByRole('button', { name: en.auth.login.submit }).click();
  await expect(page).toHaveURL(`${app}/en`);
}

/** Opens the emailed link in a fresh browser, sets the password and logs in. */
async function activateAndLogIn(browser: Browser, email: string): Promise<Page> {
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

test.describe.serial('platform admin and agency admin screens', () => {
  test('FR-ADM-01 FR-ADM-02 FR-AGY-02 FR-AGY-03 FR-AGY-04 an agency from creation to its first broker', async ({
    page,
    browser,
  }) => {
    const stamp = `${Date.now()}`;
    const agencyName = `E2E Screens Agency ${stamp}`;
    const agencyAdminEmail = `e2e-aa-${stamp}@reih.test`;
    const brokerEmail = `e2e-broker-${stamp}@reih.test`;
    const admin = createPlatformAdmin();

    await test.step('the Platform Admin creates an agency', async () => {
      await logIn(page, OPS, admin.email, admin.password);
      await page.getByRole('link', { name: en.nav.agencies }).click();
      await expect(page.getByRole('heading', { name: en.admin.agencies.title })).toBeVisible();
      await page.getByRole('button', { name: en.admin.agencies.new }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel(en.admin.agencies.form.nameAr)).toBeFocused();
      // An empty form is refused on the client, with the summary focused (NFR-14).
      await dialog.getByRole('button', { name: en.admin.agencies.form.create }).click();
      await expect(dialog.getByText(en.validation.summary)).toBeFocused();

      await dialog.getByLabel(en.admin.agencies.form.nameAr).fill(`وكالة الشاشات ${stamp}`);
      await dialog.getByLabel(en.admin.agencies.form.nameEn).fill(agencyName);
      await dialog.getByLabel(en.admin.agencies.form.tradeLicenseNo).fill(`E2E-UI-${stamp}`);
      await dialog
        .getByLabel(en.admin.agencies.form.contactEmail)
        .fill(`office-${stamp}@reih.test`);
      await dialog.getByLabel(en.admin.agencies.form.contactPhone).fill('+971500000123');
      await dialog.getByRole('button', { name: en.admin.agencies.form.create }).click();
      await expect(page).toHaveURL(new RegExp(`${OPS}/en/agencies/[0-9a-f-]{36}$`));
      await expect(page.getByRole('heading', { level: 1 })).toContainText(agencyName);
    });

    await test.step('FR-ADM-01 the first Agency Admin invitation reaches Mailpit', async () => {
      await page.getByLabel(en.invitations.columns.email, { exact: true }).fill(agencyAdminEmail);
      await page.getByRole('button', { name: en.admin.agencies.invite.submit }).click();
      await expect(page.getByRole('status').filter({ hasText: agencyAdminEmail })).toBeVisible();
      await expect(page.getByRole('row', { name: new RegExp(agencyAdminEmail) })).toBeVisible();
    });

    // The Agency Admin activates from the email and logs in to the Broker Web App.
    const agencyAdmin = await activateAndLogIn(browser, agencyAdminEmail);

    await test.step('FR-AGY-02 the Agency Admin invites a broker; an email of another agency is refused', async () => {
      // An active user of another agency (the E2E Test Agency).
      const other = inviteAgencyAdmin('en');
      const otherPage = await activateAndLogIn(browser, other.email);
      await otherPage.context().close();

      await agencyAdmin.getByRole('link', { name: en.nav.agencySettings }).click();
      await expect(
        agencyAdmin.getByRole('heading', { name: en.agencySettings.title }),
      ).toBeVisible();
      await agencyAdmin.getByRole('tab', { name: en.agencySettings.tabs.invitations }).click();

      await agencyAdmin.getByLabel(en.invitations.columns.email, { exact: true }).fill(other.email);
      await agencyAdmin.getByRole('button', { name: en.agencySettings.invitations.submit }).click();
      await expect(agencyAdmin.getByRole('main').getByRole('alert')).toHaveText(
        en.errors.EMAIL_ALREADY_REGISTERED,
      );

      await agencyAdmin.getByLabel(en.invitations.columns.email, { exact: true }).fill(brokerEmail);
      await agencyAdmin.getByRole('button', { name: en.agencySettings.invitations.submit }).click();
      await expect(agencyAdmin.getByRole('status').filter({ hasText: brokerEmail })).toBeVisible();
      await expect(agencyAdmin.getByRole('row', { name: new RegExp(brokerEmail) })).toBeVisible();
    });

    // The broker activates and logs in; brokers see no Agency settings.
    const broker = await activateAndLogIn(browser, brokerEmail);
    await test.step('FR-ACC-04 a broker sees no Agency settings, and the screen refuses them', async () => {
      await expect(broker.getByRole('link', { name: en.nav.agencySettings })).toHaveCount(0);
      await broker.goto(`${BROKER}/en/agency-settings`);
      await expect(broker.getByRole('main').getByRole('alert')).toHaveText(en.errors.FORBIDDEN);
    });

    await test.step('FR-AGY-03 the members list shows the agency members only', async () => {
      await agencyAdmin.getByRole('tab', { name: en.agencySettings.tabs.members }).click();
      const table = agencyAdmin.getByRole('table', { name: en.agencySettings.members.title });
      await expect(table.getByRole('row', { name: new RegExp(brokerEmail) })).toBeVisible();
      await expect(table.getByRole('row', { name: new RegExp(agencyAdminEmail) })).toBeVisible();
      await expect(table.getByRole('row')).toHaveCount(3); // header, the admin and the broker
    });

    await test.step('FR-AGY-04 a deactivated member is logged out at once', async () => {
      const row = agencyAdmin.getByRole('row', { name: new RegExp(brokerEmail) });
      const deactivate = row.getByRole('button', { name: en.accounts.deactivate });
      await deactivate.click();
      const dialog = agencyAdmin.getByRole('dialog');
      await expect(
        dialog.getByRole('heading', { name: en.accounts.deactivateTitle }),
      ).toBeVisible();
      // Esc closes the dialog and gives the focus back (NFR-14).
      await agencyAdmin.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(deactivate).toBeFocused();

      await deactivate.click();
      await dialog.getByRole('button', { name: en.accounts.deactivate }).click();
      await expect(dialog).toBeHidden();
      await expect(row).toContainText(en.accounts.status.deactivated);

      await broker.goto(`${BROKER}/en/profile`);
      await expect(broker).toHaveURL(/\/en\/login\?next=/);
    });

    await test.step('FR-ADM-02 a suspension without a reason is refused; with one, members are logged out', async () => {
      await page.getByRole('button', { name: en.admin.agencies.suspend }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByLabel(en.dialog.reason)).toBeFocused();
      await dialog.getByRole('button', { name: en.admin.agencies.suspend }).click();
      await expect(dialog.getByText(en.validation.required)).toBeVisible();

      await dialog.getByLabel(en.dialog.reason).fill('E2E: unpaid subscription');
      await dialog.getByRole('button', { name: en.admin.agencies.suspend }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText('E2E: unpaid subscription')).toBeVisible();
      await expect(page.getByRole('button', { name: en.admin.agencies.reactivate })).toBeVisible();

      await agencyAdmin.reload();
      await expect(agencyAdmin).toHaveURL(/\/en\/login\?next=/);
    });

    await Promise.all([agencyAdmin.context().close(), broker.context().close()]);
  });

  /** Collects every message next-intl could not find, from the browser console. */
  function watchMissingMessages(page: Page): string[] {
    const missing: string[] = [];
    page.on('console', (message) => {
      if (/MISSING_MESSAGE|INSUFFICIENT_PATH/.test(message.text())) missing.push(message.text());
    });
    return missing;
  }

  /** Switches with the header button, which also saves the choice (FR-ACC-06). */
  async function switchToArabic(page: Page) {
    await page.getByRole('button', { name: en.common.languageName.ar }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  }

  test('NFR-06 NFR-12 every Platform Admin screen opens in English and Arabic with all its text', async ({
    page,
  }) => {
    const missing = watchMissingMessages(page);
    const admin = createPlatformAdmin();
    await logIn(page, OPS, admin.email, admin.password);

    for (const lang of ['en', 'ar'] as const) {
      const copy = messages[lang];
      if (lang === 'ar') await switchToArabic(page);

      await page.goto(`${OPS}/${lang}/staff`);
      await expect(
        page.getByRole('heading', { name: copy.admin.staff.title, level: 1 }),
      ).toBeVisible();
      await expect(page.getByRole('table', { name: copy.admin.staff.members })).toBeVisible();

      await page.goto(`${OPS}/${lang}/reference-data`);
      await expect(
        page.getByRole('heading', { name: copy.admin.reference.title, level: 1 }),
      ).toBeVisible();
      for (const kind of Object.values(copy.admin.reference.kinds)) {
        const tab = page.getByRole('tab', { name: kind, exact: true });
        await tab.click();
        await expect(tab).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tabpanel')).not.toContainText(copy.state.loading);
      }
      await page.getByRole('button', { name: copy.admin.reference.new }).click();
      await expect(
        page.getByRole('dialog').getByLabel(copy.admin.reference.columns.icon),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog')).toBeHidden();

      await page.goto(`${OPS}/${lang}/currencies-settings`);
      await expect(
        page.getByRole('heading', { name: copy.admin.currencies.title, level: 1 }),
      ).toBeVisible();
      await page.getByRole('button', { name: copy.admin.currencies.rates }).first().click();
      // The date picker allows no later day than today in the UAE.
      await expect(page.getByLabel(copy.admin.currencies.columns.effectiveDate)).toHaveAttribute(
        'max',
        /^\d{4}-\d{2}-\d{2}$/,
      );
      await expect(page.getByLabel(copy.admin.settings.staleThresholdDays)).toBeVisible();

      await page.goto(`${OPS}/${lang}/agencies`);
      await expect(
        page.getByRole('heading', { name: copy.admin.agencies.title, level: 1 }),
      ).toBeVisible();
    }
    expect(missing).toEqual([]);
  });

  test('NFR-06 FR-AGY-01 Agency settings open in English and Arabic; an SVG logo shows its note', async ({
    browser,
  }) => {
    const { email } = inviteAgencyAdmin('en');
    const page = await activateAndLogIn(browser, email);
    const missing = watchMissingMessages(page);

    for (const lang of ['en', 'ar'] as const) {
      const copy = messages[lang];
      if (lang === 'ar') await switchToArabic(page);
      await page.goto(`${BROKER}/${lang}/agency-settings`);
      await expect(
        page.getByRole('heading', { name: copy.agencySettings.title, level: 1 }),
      ).toBeVisible();
      await expect(
        page.getByRole('img', { name: copy.agencySettings.branding.preview }),
      ).toBeVisible();

      await page.getByLabel(copy.agencySettings.logo.file).setInputFiles({
        name: 'logo.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'),
      });
      await expect(page.getByRole('note')).toBeVisible();

      for (const tab of Object.values(copy.agencySettings.tabs)) {
        await page.getByRole('tab', { name: tab, exact: true }).click();
        await expect(page.getByRole('tabpanel')).not.toContainText(copy.state.loading);
      }
    }
    expect(missing).toEqual([]);
    await page.context().close();
  });
});
