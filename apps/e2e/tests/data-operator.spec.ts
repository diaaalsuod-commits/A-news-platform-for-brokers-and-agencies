import { expect, type Page, test } from '@playwright/test';
import { messages } from '@reih/i18n';
import {
  apiCall,
  createDataOperator,
  failMapStyle,
  MAP_STYLE_URL,
  OPS,
  switchToArabic,
  useLocalMapStyle,
  useRealMapStyle,
  watchMissingMessages,
} from './support';

const en = messages.en;

/**
 * P4.4 parts a and b: the Data Operator's developers, sales contacts, areas and projects screens.
 * The Data Operator comes from the real Staff invitation flow (docs/plans/p4.4.md, rule 11).
 */
test.describe.serial('data operator: developers, sales contacts, areas, projects', () => {
  let operator: Page;
  let admin: Page;
  const stamp = `${Date.now()}`;
  const developerName = `E2E Developer ${stamp}`;
  const emirateName = `E2E Emirate ${stamp}`;
  const communityName = `E2E Community ${stamp}`;
  const contactName = `E2E Contact ${stamp}`;
  const projectName = `E2E Project ${stamp}`;
  const amenityName = `E2E Amenity ${stamp}`;
  let projectPath = '';

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
    for (const label of [en.nav.projects, en.nav.developers, en.nav.salesContacts, en.nav.areas]) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
    await expect(nav.getByRole('link', { name: en.nav.agencies })).toHaveCount(0);
    await operator.goto(`${OPS}/en/agencies`);
    await expect(operator.getByRole('main').getByRole('alert')).toHaveText(en.errors.FORBIDDEN);

    await expect(admin.getByRole('link', { name: en.nav.developers })).toHaveCount(0);
    for (const path of ['projects', 'projects/new', 'developers', 'sales-contacts', 'areas']) {
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

  // ---------------------------------------------------------------- projects (P4.4 part b)

  const projectCopy = en.content.projects;
  /** The map's container, named for screen readers. */
  const projectMap = () => operator.getByRole('group', { name: projectCopy.locationMap });
  const mapReady = () => expect(operator.getByText(en.map.clickHint)).toBeVisible();
  const marker = () => operator.locator('.maplibregl-marker');

  test('FR-DAT-04 a project is created from the screens and starts as a draft', async () => {
    await useLocalMapStyle(operator);
    await operator.goto(`${OPS}/en`);
    // The list is paged by the API (server paging of the DataTable).
    const listRequest = operator.waitForRequest(
      (request) => new URL(request.url()).pathname === '/api/v1/content/projects',
    );
    await operator.getByRole('link', { name: en.nav.projects }).click();
    await expect(
      operator.getByRole('heading', { name: projectCopy.title, level: 1 }),
    ).toBeVisible();
    const query = new URL((await listRequest).url()).searchParams;
    expect([query.get('page'), query.get('pageSize')]).toEqual(['1', '20']);

    await operator.getByRole('link', { name: projectCopy.new }).click();
    await expect(operator).toHaveURL(`${OPS}/en/projects/new`);
    await expect(
      operator.getByRole('heading', { name: projectCopy.newTitle, level: 1 }),
    ).toBeVisible();
    // Required fields are named before anything is sent (FR-DAT-04).
    await operator.getByRole('button', { name: projectCopy.create }).click();
    await expect(operator.getByText(en.validation.summary)).toBeFocused();

    await operator.getByLabel(en.content.common.nameAr).fill(`مشروع تجريبي ${stamp}`);
    await operator.getByLabel(en.content.common.nameEn).fill(projectName);
    await operator.getByLabel(projectCopy.columns.developer).selectOption({ label: developerName });
    await operator
      .getByLabel(projectCopy.columns.community)
      .selectOption({ label: `${communityName} — ${emirateName}` });
    await operator
      .getByLabel(projectCopy.columns.stage)
      .selectOption({ label: projectCopy.stage.under_construction });
    await operator.getByLabel(projectCopy.quarter).selectOption({ label: 'Q3' });
    await operator.getByLabel(projectCopy.year).fill('2029');
    await operator.getByLabel(projectCopy.serviceCharge).fill('15.50');

    // The location by a click on the map (a local style: no network needed).
    await mapReady();
    await expect(marker()).toHaveCount(0);
    await projectMap().click();
    await expect(marker()).toHaveCount(1);
    const lng = Number(await operator.getByLabel(projectCopy.lng).inputValue());
    const lat = Number(await operator.getByLabel(projectCopy.lat).inputValue());
    // The map opens on the UAE, so its middle is inside the API's box.
    expect(lng).toBeGreaterThan(51.4);
    expect(lng).toBeLessThan(56.6);
    expect(lat).toBeGreaterThan(22.4);
    expect(lat).toBeLessThan(26.5);

    await operator.getByRole('button', { name: projectCopy.create }).click();
    await expect(operator).toHaveURL(new RegExp(`${OPS}/en/projects/[0-9a-f-]{36}$`));
    projectPath = new URL(operator.url()).pathname.replace(/^\/en/, '');
    await expect(operator.getByRole('heading', { level: 1 })).toHaveText(projectName);
    // FR-DAT-04: a new project is always a draft.
    await expect(
      operator
        .getByRole('region', { name: en.content.common.status })
        .getByText(projectCopy.status.draft, { exact: true }),
    ).toBeVisible();
    await expect(operator.getByLabel(projectCopy.lng)).toHaveValue(String(lng));

    // The location typed in the fields moves the marker and is stored.
    await operator.getByLabel(projectCopy.lng).fill('55.2708');
    await operator.getByLabel(projectCopy.lat).fill('25.2048');
    await expect(marker()).toHaveCount(1);
    await operator.getByRole('button', { name: en.content.common.save }).click();
    await expect(operator.getByText(projectCopy.saved)).toBeVisible();
    await operator.reload();
    await expect(operator.getByLabel(projectCopy.lng)).toHaveValue('55.2708');
    await expect(operator.getByLabel(projectCopy.lat)).toHaveValue('25.2048');

    await operator.getByRole('link', { name: projectCopy.back }).click();
    await operator.getByLabel(projectCopy.search).fill(projectName);
    await operator.getByRole('button', { name: en.content.common.apply }).click();
    const row = operator.getByRole('row', { name: new RegExp(projectName) });
    await expect(row).toContainText(projectCopy.status.draft);
    await expect(row).toContainText(developerName);
  });

  test('NFR-12 FR-DAT-04 when the map cannot load, it says so with Retry and the fields still work', async () => {
    await failMapStyle(operator);
    await operator.goto(`${OPS}/en${projectPath}?tab=details`);
    const alert = operator.getByRole('alert').filter({ hasText: en.map.error });
    await expect(alert).toBeVisible();
    await operator.getByLabel(projectCopy.lng).fill('55.14');
    await operator.getByLabel(projectCopy.lat).fill('25.08');
    await operator.getByRole('button', { name: en.content.common.save }).click();
    await expect(operator.getByText(projectCopy.saved)).toBeVisible();

    await useLocalMapStyle(operator);
    await alert.getByRole('button', { name: en.map.retry }).click();
    await mapReady();
    await expect(marker()).toHaveCount(1);
  });

  test('NFR-15 the map credits its data, uncollapsed, from the real OpenFreeMap style', async () => {
    await useRealMapStyle(operator);
    // A clear cause when the network is the problem, not a generic timeout.
    let reachable: string | null = null;
    try {
      const response = await operator.request.get(MAP_STYLE_URL, { timeout: 15_000 });
      if (!response.ok()) reachable = `it answered HTTP ${response.status()}`;
    } catch (error) {
      reachable = `the request failed: ${(error as Error).message.split('\n')[0]}`;
    }
    if (reachable !== null) {
      throw new Error(
        `NETWORK: ${MAP_STYLE_URL} could not be reached from this machine (${reachable}). ` +
          'This one check needs the real style; the other map tests use a local style.',
      );
    }

    await operator.goto(`${OPS}/en${projectPath}?tab=details`);
    const attribution = operator.locator('.maplibregl-ctrl-attrib-inner');
    await expect(attribution).toContainText('OpenStreetMap', { timeout: 30_000 });
    await expect(operator.locator('.maplibregl-compact')).toHaveCount(0);
    const text = (await attribution.innerText()).replace(/\s+/g, ' ').trim();
    test.info().annotations.push({ type: 'map attribution', description: text });
    console.log(`MAP_ATTRIBUTION ${text}`);
    await useLocalMapStyle(operator);
  });

  test('P4.4 rule 3 maplibre-gl is downloaded only by a page that shows a map', async () => {
    await useLocalMapStyle(operator);
    // A string only maplibre-gl's own code carries (its attribution control's class).
    const SIGNATURE = 'maplibregl-ctrl-attrib-inner';
    const scripts: { url: string; body: Promise<string | null> }[] = [];
    const collect = (response: import('@playwright/test').Response) => {
      if (response.request().resourceType() !== 'script') return;
      // Read at once, while the page still holds the body; a body that never ends is reported.
      const body = Promise.race([
        response.text().catch(() => null),
        new Promise<null>((done) => setTimeout(() => done(null), 15_000)),
      ]);
      scripts.push({ url: response.url(), body });
    };
    const carriers = async () => {
      const found: string[] = [];
      const unread: string[] = [];
      for (const script of scripts) {
        const body = await script.body;
        if (body === null) unread.push(script.url);
        else if (body.includes(SIGNATURE)) found.push(script.url);
      }
      return { found, unread };
    };
    operator.on('response', collect);
    try {
      // A full load of a page without a map: none of its scripts is maplibre-gl.
      await operator.goto(`${OPS}/en/developers`);
      await expect(
        operator.getByRole('heading', { name: en.content.developers.title, level: 1 }),
      ).toBeVisible();
      await expect(operator.getByRole('table')).toBeVisible();
      await operator.waitForLoadState('load');
      expect(scripts.length, 'the page loaded scripts').toBeGreaterThan(0);
      const page = await carriers();
      const scriptsWithoutMap = scripts.length;
      expect(page.unread, 'every script of the page could be read').toEqual([]);
      expect(page.found, 'scripts of a page without a map that carry maplibre-gl').toEqual([]);

      // Control: the same check finds maplibre-gl once a map is shown.
      scripts.length = 0;
      await operator.goto(`${OPS}/en/projects/new`);
      await mapReady();
      const withMap = await carriers();
      expect(withMap.found.length, 'a script carrying maplibre-gl').toBeGreaterThan(0);
      console.log(
        `MAPLIBRE_CHECK without map: ${page.found.length} of ${scriptsWithoutMap} scripts; ` +
          `with map: ${withMap.found.map((url) => new URL(url).pathname).join(', ')}`,
      );
    } finally {
      operator.off('response', collect);
    }
  });

  test('FR-DAT-04 FR-ADM-04 amenities are saved; a deactivated one stays, marked, and cannot be chosen again', async () => {
    // The Platform Admin's reference data, set up through the API (FR-ADM-04 has its own tests).
    await admin.goto(`${OPS}/en`);
    const category = await apiCall(admin, 'post', '/admin/reference/amenity-categories', {
      nameAr: `فئة ${stamp}`,
      nameEn: `E2E Category ${stamp}`,
    });
    expect(category.status).toBe(201);
    const amenity = await apiCall(admin, 'post', '/admin/reference/amenities', {
      nameAr: `مرفق ${stamp}`,
      nameEn: amenityName,
      categoryId: category.body.id,
    });
    expect(amenity.status).toBe(201);

    await operator.goto(`${OPS}/en${projectPath}?tab=amenities`);
    await expect(operator.getByRole('tab', { name: projectCopy.tabs.amenities })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await operator.getByLabel(amenityName, { exact: true }).check();
    await operator.getByRole('button', { name: projectCopy.amenities.save }).click();
    await expect(operator.getByText(projectCopy.amenities.saved)).toBeVisible();

    const off = await apiCall(admin, 'patch', `/admin/reference/amenities/${amenity.body.id}`, {
      isActive: false,
    });
    expect(off.status).toBe(200);

    await operator.reload();
    const marked = operator.getByLabel(`${amenityName} ${projectCopy.amenities.deactivated}`, {
      exact: true,
    });
    await expect(marked).toBeChecked();
    await expect(marked).toBeEnabled();
    await expect(operator.getByText(projectCopy.amenities.deactivatedHint)).toBeVisible();
    // Unchecked, it cannot be checked again.
    await marked.uncheck();
    await expect(marked).toBeDisabled();
    await operator.reload();
    await expect(marked).toBeChecked();
  });

  test('FR-DAT-04 an archived project is read-only, and Restore makes it an editable draft again', async () => {
    // The Archive button comes with the publish screens (part d); the API archives it here.
    await operator.goto(`${OPS}/en${projectPath}?tab=details`);
    const archived = await apiCall(operator, 'post', `/content${projectPath}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');

    await operator.reload();
    const header = operator.getByRole('region', { name: en.content.common.status });
    await expect(header.getByText(projectCopy.status.archived, { exact: true })).toBeVisible();
    await expect(operator.getByText(projectCopy.archivedNotice)).toBeVisible();
    await expect(operator.getByLabel(en.content.common.nameEn)).toBeDisabled();
    await expect(operator.getByRole('button', { name: en.content.common.save })).toBeDisabled();
    await expect(operator.getByText(en.map.readOnly)).toBeVisible();
    await operator.getByRole('tab', { name: projectCopy.tabs.amenities }).click();
    await expect(operator).toHaveURL(/\?tab=amenities$/);
    await expect(operator.getByRole('button', { name: projectCopy.amenities.save })).toBeDisabled();

    await header.getByRole('button', { name: projectCopy.restore }).click();
    await operator.getByRole('dialog').getByRole('button', { name: projectCopy.restore }).click();
    await expect(header.getByText(projectCopy.status.draft, { exact: true })).toBeVisible();
    await expect(header.getByRole('button', { name: projectCopy.restore })).toHaveCount(0);
    await expect(operator.getByRole('button', { name: projectCopy.amenities.save })).toBeEnabled();
    await operator.getByRole('tab', { name: projectCopy.tabs.details }).click();
    await expect(operator.getByLabel(en.content.common.nameEn)).toBeEnabled();
  });

  test('FR-DAT-04 FR-ADM-04 an archived developer and a deactivated community stay on the project, marked', async () => {
    await operator.goto(`${OPS}/en${projectPath}?tab=details`);
    const read = await operator.request.get(`${OPS}/api/v1/content${projectPath}`);
    expect(read.status()).toBe(200);
    const project = (await read.json()) as { developer: { id: string }; community: { id: string } };
    const developerPath = `/content/developers/${project.developer.id}`;
    const communityPath = `/content/areas/${project.community.id}`;
    expect((await apiCall(operator, 'patch', developerPath, { status: 'archived' })).status).toBe(
      200,
    );
    expect((await apiCall(operator, 'patch', communityPath, { isActive: false })).status).toBe(200);
    try {
      await operator.reload();
      await expect(
        operator.getByLabel(projectCopy.columns.developer).locator('option:checked'),
      ).toHaveText(`${developerName} ${projectCopy.archivedMark}`);
      await expect(
        operator.getByLabel(projectCopy.columns.community).locator('option:checked'),
      ).toHaveText(`${communityName} — ${emirateName} ${projectCopy.inactiveMark}`);
      // Kept on the project: the form still saves with them (Q7 of P4.2).
      await operator.getByRole('button', { name: en.content.common.save }).click();
      await expect(operator.getByText(projectCopy.saved)).toBeVisible();

      // A new project is never offered them.
      await operator.goto(`${OPS}/en/projects/new`);
      // Once both lists have loaded (more than the "Choose…" option).
      for (const label of [projectCopy.columns.developer, projectCopy.columns.community]) {
        await expect
          .poll(() => operator.getByLabel(label).locator('option').count())
          .toBeGreaterThan(1);
      }
      await expect(
        operator
          .getByLabel(projectCopy.columns.developer)
          .getByRole('option', { name: developerName }),
      ).toHaveCount(0);
      await expect(
        operator
          .getByLabel(projectCopy.columns.community)
          .getByRole('option', { name: new RegExp(communityName) }),
      ).toHaveCount(0);
    } finally {
      await apiCall(operator, 'patch', developerPath, { status: 'active' });
      await apiCall(operator, 'patch', communityPath, { isActive: true });
    }
  });

  test('NFR-06 NFR-12 every Data Operator screen opens in English and Arabic with all its text', async () => {
    const missing = watchMissingMessages(operator);
    await useLocalMapStyle(operator);
    for (const lang of ['en', 'ar'] as const) {
      const copy = messages[lang];
      if (lang === 'ar') {
        // Switching language keeps the screen and its tab (the tab is in the address).
        await operator.goto(`${OPS}/en${projectPath}?tab=amenities`);
        await expect(operator.getByRole('tab', { selected: true })).toHaveText(
          en.content.projects.tabs.amenities,
        );
        await switchToArabic(operator);
        await expect(operator).toHaveURL(`${OPS}/ar${projectPath}?tab=amenities`);
        await expect(operator.getByRole('tab', { selected: true })).toHaveText(
          copy.content.projects.tabs.amenities,
        );
      }

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
      // The area form with its map picker.
      await operator
        .getByRole('tab', { name: copy.content.areas.tabs.emirate, exact: true })
        .click();
      await operator.getByRole('button', { name: copy.content.areas.new.emirate }).click();
      await expect(
        operator.getByRole('dialog').getByRole('group', { name: copy.content.areas.centerMap }),
      ).toBeVisible();
      await expect(operator.getByRole('dialog').getByText(copy.map.clickHint)).toBeVisible();
      await operator.keyboard.press('Escape');

      // Projects: the list, a new project, and each tab of the editor.
      const projects = copy.content.projects;
      await operator.goto(`${OPS}/${lang}/projects`);
      await expect(operator.getByRole('heading', { name: projects.title, level: 1 })).toBeVisible();
      await expect(operator.getByRole('table')).toBeVisible();
      await operator.goto(`${OPS}/${lang}/projects/new`);
      await expect(
        operator.getByRole('heading', { name: projects.newTitle, level: 1 }),
      ).toBeVisible();
      await expect(operator.getByText(copy.map.clickHint)).toBeVisible();
      for (const tab of ['details', 'amenities'] as const) {
        await operator.goto(`${OPS}/${lang}${projectPath}?tab=${tab}`);
        await expect(operator.getByRole('tab', { selected: true })).toHaveText(projects.tabs[tab]);
        await expect(operator.getByRole('tabpanel')).not.toContainText(copy.state.loading);
      }
      await expect(operator.getByRole('button', { name: projects.amenities.save })).toBeVisible();
    }
    expect(missing).toEqual([]);
  });
});
