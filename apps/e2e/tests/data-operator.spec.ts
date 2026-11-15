import { expect, type Page, test } from '@playwright/test';
import { messages } from '@reih/i18n';
import { createDataOperator, OPS, switchToArabic, watchMissingMessages } from './support';

const en = messages.en;

/**
 * P4.4 part a: the Data Operator's developers, sales contacts and areas screens. The Data Operator
 * comes from the real Staff invitation flow (docs/plans/p4.4.md, rule 11).
 */
test.describe.serial('data operator: developers, sales contacts, areas', () => {
  let operator: Page;
  let admin: Page;
  const stamp = `${Date.now()}`;
  const developerName = `E2E Developer ${stamp}`;
  const emirateName = `E2E Emirate ${stamp}`;
  const communityName = `E2E Community ${stamp}`;
  const contactName = `E2E Contact ${stamp}`;

  test.beforeAll(async ({ browser }) => {
    ({ operator, admin } = await createDataOperator(browser));
  });

  test.afterAll(async () => {
    await Promise.all([operator?.context().close(), admin?.context().close()]);
  });

  /**
   * Narrows the list on screen to one name. The lists page by 20, and every run adds its own rows
   * to the shared dev database, so a new row may land on a later page.
   */
  async function searchFor(text: string, apply: string = en.content.common.apply) {
    const form = operator.getByRole('search');
    await form.getByRole('searchbox').fill(text);
    await form.getByRole('button', { name: apply }).click();
  }

  test("FR-ACC-04 NFR-09 the content screens are the Data Operator's only", async () => {
    const nav = operator.getByRole('navigation', { name: en.nav.main });
    for (const label of [en.nav.developers, en.nav.salesContacts, en.nav.areas]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: en.nav.agencies })).toHaveCount(0);
    await operator.goto(`${OPS}/en/agencies`);
    await expect(operator.getByRole('main').getByRole('alert')).toHaveText(en.errors.FORBIDDEN);

    await expect(admin.getByRole('link', { name: en.nav.developers })).toHaveCount(0);
    for (const path of ['developers', 'sales-contacts', 'areas']) {
      await admin.goto(`${OPS}/en/${path}`);
      await expect(admin.getByRole('main').getByRole('alert')).toHaveText(en.errors.FORBIDDEN);
    }
  });

  test('FR-DAT-01 FR-LOC-03 a developer is created, archived and restored', async () => {
    const copy = en.content.developers;
    await operator.goto(`${OPS}/en`);
    await operator.getByRole('link', { name: en.nav.developers }).click();
    await expect(operator.getByRole('heading', { name: copy.title, level: 1 })).toBeVisible();

    await operator.getByRole('button', { name: copy.new }).click();
    const dialog = operator.getByRole('dialog');
    await expect(dialog.getByLabel(en.content.common.nameAr)).toBeFocused();
    // Both names are required (FR-DAT-01); the summary takes the focus (NFR-14).
    await dialog.getByRole('button', { name: copy.create }).click();
    await expect(dialog.getByText(en.validation.summary)).toBeFocused();

    await dialog.getByLabel(en.content.common.nameAr).fill(`مطوّر تجريبي ${stamp}`);
    await dialog.getByLabel(en.content.common.nameEn).fill(developerName);
    await dialog.getByLabel(en.content.common.descriptionEn).fill('Built for the e2e tests.');
    await dialog.getByLabel(copy.website).fill('http://insecure.example');
    await dialog.getByRole('button', { name: copy.create }).click();
    await expect(dialog.getByText(en.validation.invalidFormat)).toBeVisible();
    await dialog.getByLabel(copy.website).fill('https://developer.example');
    await dialog.getByRole('button', { name: copy.create }).click();

    await expect(operator).toHaveURL(new RegExp(`${OPS}/en/developers/[0-9a-f-]{36}$`));
    await expect(operator.getByRole('heading', { level: 1 })).toHaveText(developerName);
    await expect(operator.getByText(copy.noLogo)).toBeVisible();

    await operator.getByRole('button', { name: copy.archive }).click();
    await operator.getByRole('dialog').getByRole('button', { name: copy.archive }).click();
    await expect(operator.getByRole('button', { name: copy.restore })).toBeVisible();
    await operator.getByRole('button', { name: copy.restore }).click();
    await operator.getByRole('dialog').getByRole('button', { name: copy.restore }).click();
    await expect(operator.getByRole('button', { name: copy.archive })).toBeVisible();

    await operator.getByRole('link', { name: copy.back }).click();
    await searchFor(developerName);
    await expect(operator.getByRole('row', { name: new RegExp(developerName) })).toBeVisible();
  });

  test('FR-DAT-03 FR-LOC-04 an emirate and its community, with a center inside the UAE', async () => {
    const copy = en.content.areas;
    await operator.getByRole('link', { name: en.nav.areas }).click();
    await expect(operator.getByRole('heading', { name: copy.title, level: 1 })).toBeVisible();
    // FR-LOC-04: the UAE is shown as the only market.
    await expect(operator.getByText('United Arab Emirates')).toBeVisible();

    await operator.getByRole('button', { name: copy.new.emirate }).click();
    const dialog = operator.getByRole('dialog');
    await dialog.getByLabel(en.content.common.nameAr).fill(`إمارة تجريبية ${stamp}`);
    await dialog.getByLabel(en.content.common.nameEn).fill(emirateName);
    // A point outside the UAE is refused by the API with its own message, on the center.
    await dialog.getByLabel(copy.lng).fill('70');
    await dialog.getByLabel(copy.lat).fill('24');
    await dialog.getByRole('button', { name: copy.create.emirate }).click();
    await expect(dialog.getByText(en.validation.server.outside_uae)).toBeVisible();
    await dialog.getByLabel(copy.lng).fill('55.3');
    await dialog.getByRole('button', { name: copy.create.emirate }).click();
    await expect(dialog).toBeHidden();
    await searchFor(emirateName);
    await expect(operator.getByRole('row', { name: new RegExp(emirateName) })).toBeVisible();

    await operator.getByRole('tab', { name: copy.tabs.community, exact: true }).click();
    await operator.getByRole('button', { name: copy.new.community }).click();
    // A community needs its emirate (FR-DAT-03).
    await dialog.getByLabel(en.content.common.nameAr).fill(`مجتمع تجريبي ${stamp}`);
    await dialog.getByLabel(en.content.common.nameEn).fill(communityName);
    await dialog.getByLabel(copy.lng).fill('55.31');
    await dialog.getByLabel(copy.lat).fill('25.21');
    await dialog.getByRole('button', { name: copy.create.community }).click();
    await expect(dialog.getByText(en.validation.required)).toBeVisible();
    await dialog.getByLabel(copy.columns.emirate).selectOption({ label: emirateName });
    await dialog.getByRole('button', { name: copy.create.community }).click();
    await expect(dialog).toBeHidden();
    await searchFor(communityName);
    const row = operator.getByRole('row', { name: new RegExp(communityName) });
    await expect(row).toContainText(emirateName);

    // An emirate with a community is in use: deleting it is refused with its message.
    await operator.getByRole('tab', { name: copy.tabs.emirate, exact: true }).click();
    await searchFor(emirateName);
    await operator
      .getByRole('row', { name: new RegExp(emirateName) })
      .getByRole('button', { name: en.content.common.delete })
      .click();
    await dialog.getByRole('button', { name: en.content.common.delete }).click();
    await expect(dialog.getByRole('alert')).toHaveText(en.errors.AREA_IN_USE);
    await operator.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('FR-DAT-02 a sales contact of the developer, with languages checked', async () => {
    const copy = en.content.contacts;
    await operator.getByRole('link', { name: en.nav.salesContacts }).click();
    await expect(operator.getByRole('heading', { name: copy.title, level: 1 })).toBeVisible();

    await operator.getByRole('button', { name: copy.new }).click();
    const dialog = operator.getByRole('dialog');
    await expect(dialog.getByText(copy.form.projectsChooseDeveloper)).toBeVisible();
    await dialog.getByLabel(copy.form.developer).selectOption({ label: developerName });
    await expect(dialog.getByText(copy.form.projectsNone)).toBeVisible();
    await dialog.getByLabel(copy.form.fullName).fill(contactName);
    await dialog.getByLabel(copy.form.title).fill('Sales manager');
    await dialog.getByLabel(copy.form.phone).fill('+971501234567');
    await dialog.getByLabel(copy.form.languages).fill('ar, english');
    await dialog.getByRole('button', { name: copy.create }).click();
    await expect(dialog.getByText(en.validation.invalidFormat)).toBeVisible();

    await dialog.getByLabel(copy.form.languages).fill('ar, en');
    await dialog.getByRole('button', { name: copy.create }).click();
    await expect(dialog).toBeHidden();
    await searchFor(contactName);
    const row = operator.getByRole('row', { name: new RegExp(contactName) });
    await expect(row).toContainText(developerName);
    await expect(row).toContainText('ar, en');

    await row.getByRole('button', { name: en.content.common.deactivate }).click();
    await expect(row).toContainText(en.content.common.inactive);
  });

  test('NFR-06 NFR-12 every Data Operator screen opens in English and Arabic with all its text', async () => {
    const missing = watchMissingMessages(operator);
    for (const lang of ['en', 'ar'] as const) {
      const copy = messages[lang];
      if (lang === 'ar') await switchToArabic(operator);

      await operator.goto(`${OPS}/${lang}/developers`);
      await expect(
        operator.getByRole('heading', { name: copy.content.developers.title, level: 1 }),
      ).toBeVisible();
      await operator.getByRole('button', { name: copy.content.developers.new }).click();
      await expect(
        operator.getByRole('dialog').getByLabel(copy.content.common.descriptionAr),
      ).toBeVisible();
      await operator.keyboard.press('Escape');
      await searchFor(developerName, copy.content.common.apply);
      await operator
        .getByRole('row', { name: new RegExp(developerName) })
        .getByRole('link')
        .click();
      await expect(
        operator.getByRole('heading', { name: copy.content.developers.logo.title, exact: true }),
      ).toBeVisible();

      await operator.goto(`${OPS}/${lang}/sales-contacts`);
      await expect(
        operator.getByRole('heading', { name: copy.content.contacts.title, level: 1 }),
      ).toBeVisible();
      await searchFor(contactName, copy.content.common.apply);
      await operator
        .getByRole('row', { name: new RegExp(contactName) })
        .getByRole('button', { name: copy.content.common.edit })
        .click();
      await expect(
        operator.getByRole('dialog').getByLabel(copy.content.contacts.form.fullName),
      ).toHaveValue(contactName);
      await operator.keyboard.press('Escape');

      await operator.goto(`${OPS}/${lang}/areas`);
      for (const tab of Object.values(copy.content.areas.tabs)) {
        await operator.getByRole('tab', { name: tab, exact: true }).click();
        await expect(operator.getByRole('tabpanel')).not.toContainText(copy.state.loading);
        await expect(operator.getByRole('tabpanel').getByRole('table')).toBeVisible();
      }
    }
    expect(missing).toEqual([]);
  });
});
