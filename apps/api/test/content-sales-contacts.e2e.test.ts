import { randomUUID } from 'node:crypto';
import { salesContactDetailSchema } from '@reih/contracts';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SalesContactReader } from '../src/modules/content/index.js';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

const PHONE = '+971501234567';
const WHATSAPP = '+971509876543';
const EMAIL = 'sara.haddad@developer.example';

describe('Sales contacts (FR-DAT-02, FR-CNT-01)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;
  let developerA: string;
  let developerB: string;
  let communityId: string;

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
    developerA = await fixtures.developer();
    developerB = await fixtures.developer();
    communityId = await fixtures.community(await fixtures.emirate());
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
  });

  const project = (developerId: string, status?: 'draft' | 'published' | 'archived') =>
    fixtures.project({ developerId, communityId, createdBy: operator.id, status });
  const contactBody = (overrides: object = {}) => ({
    developerId: developerA,
    fullName: 'Sara Haddad',
    phone: PHONE,
    ...overrides,
  });
  const create = (overrides: object = {}) =>
    h.post('/content/sales-contacts', { session, body: contactBody(overrides) });
  const createId = async (overrides: object = {}) => {
    const response = await create(overrides);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };
  const patch = (id: string, body: object) =>
    h.send('patch', `/content/sales-contacts/${id}`, { session, body });
  const read = async (id: string) => (await h.get(`/content/sales-contacts/${id}`, session)).body;
  const assignedIds = async (id: string) =>
    (
      await h.db.query(
        'SELECT project_id FROM project_sales_contacts WHERE sales_contact_id = $1 ORDER BY 1',
        [id],
      )
    ).rows.map((row: { project_id: string }) => row.project_id);
  const issues = (response: { body: { error: { details: { issues: unknown[] } } } }) =>
    response.body.error.details.issues;
  const reader = () => h.app.get(SalesContactReader);

  // ---------------------------------------------------------------- manage

  it('FR-DAT-02 stores every field and returns it to the Data Operator', async () => {
    const [first, second] = [await project(developerA), await project(developerA)];
    const response = await create({
      title: 'Sales manager',
      whatsapp: WHATSAPP,
      email: `  ${EMAIL.toUpperCase()} `,
      languages: ['ar', 'EN', 'ru'],
      verifiedAt: '2026-11-01',
      verificationSource: 'Phone call with the developer',
      projectIds: [first, second],
    });
    expect(response.status).toBe(201);
    expect(salesContactDetailSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({
      developer: { id: developerA, status: 'active' },
      fullName: 'Sara Haddad',
      title: 'Sales manager',
      phone: PHONE,
      whatsapp: WHATSAPP,
      email: EMAIL,
      languages: ['ar', 'en', 'ru'],
      verifiedAt: '2026-11-01',
      verificationSource: 'Phone call with the developer',
      isActive: true,
      projectCount: 2,
    });
    expect(response.body.projects.map((item: { id: string }) => item.id).sort()).toEqual(
      [first, second].sort(),
    );
    expect(await read(response.body.id)).toEqual(response.body);
  });

  it('FR-DAT-02 only a name, a phone and a developer are required', async () => {
    const response = await create();
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      title: null,
      whatsapp: null,
      email: null,
      languages: [],
      verifiedAt: null,
      verificationSource: null,
      isActive: true,
      projectCount: 0,
      projects: [],
    });
  });

  it('FR-DAT-02 refuses bad input with 400 and names the field', async () => {
    for (const [overrides, path] of [
      [{ phone: '050 123 4567' }, 'phone'],
      [{ whatsapp: 'whatsapp' }, 'whatsapp'],
      [{ email: 'not-an-email' }, 'email'],
      [{ fullName: ' ' }, 'fullName'],
      [{ languages: ['arabic'] }, 'languages.0'],
      [{ languages: ['ar', 'ar'] }, 'languages'],
      [{ verifiedAt: '2026-02-30', verificationSource: 'Call' }, 'verifiedAt'],
      [{ verifiedAt: '2026-11-01' }, 'verificationSource'],
      [{ verificationSource: 'Call' }, 'verifiedAt'],
      [{ verifiedAt: '2999-01-01', verificationSource: 'Call' }, 'verifiedAt'],
      [{ developerId: randomUUID() }, 'developerId'],
      [{ projectIds: [randomUUID()] }, 'projectIds'],
    ] as [object, string][]) {
      const response = await create(overrides);
      expect(response.status, JSON.stringify(overrides)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
      expect(issues(response), JSON.stringify(overrides)).toContainEqual(
        expect.objectContaining({ path }),
      );
    }
    expect((await create({ agencyId: randomUUID() })).status).toBe(400);
  });

  it('FR-DAT-02 an edit changes only the fields sent; isActive deactivates and reactivates', async () => {
    const id = await createId({ title: 'Sales manager', email: EMAIL });
    const edited = await patch(id, { fullName: 'Sara H. Haddad', title: null });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({
      fullName: 'Sara H. Haddad',
      title: null,
      email: EMAIL,
      phone: PHONE,
    });

    expect((await patch(id, { isActive: false })).body.isActive).toBe(false);
    expect((await patch(id, { isActive: true })).body.isActive).toBe(true);
    expect((await patch(randomUUID(), { fullName: 'Nobody' })).status).toBe(404);
  });

  it('FR-DAT-02 the verification date and source are checked against the stored contact too', async () => {
    const id = await createId({ verifiedAt: '2026-11-01', verificationSource: 'Call' });
    const sourceOnlyCleared = await patch(id, { verificationSource: null });
    expect(sourceOnlyCleared.status).toBe(400);
    expect(issues(sourceOnlyCleared)).toEqual([{ path: 'verificationSource', code: 'required' }]);

    const bothCleared = await patch(id, { verifiedAt: null, verificationSource: null });
    expect(bothCleared.status).toBe(200);
    expect(bothCleared.body).toMatchObject({ verifiedAt: null, verificationSource: null });
  });

  // ---------------------------------------------------------------- assigned projects

  it('FR-DAT-02 a contact is assigned only to projects of its own developer: 400 on a mismatch', async () => {
    const own = await project(developerA);
    const foreign = await project(developerB);

    const onCreate = await create({ projectIds: [own, foreign] });
    expect(onCreate.status).toBe(400);
    expect(issues(onCreate)).toEqual([{ path: 'projectIds', code: 'other_developer' }]);

    const id = await createId({ projectIds: [own] });
    const onUpdate = await patch(id, { projectIds: [own, foreign] });
    expect(onUpdate.status).toBe(400);
    expect(issues(onUpdate)).toEqual([{ path: 'projectIds', code: 'other_developer' }]);
    expect(await assignedIds(id)).toEqual([own]);
  });

  it('FR-DAT-02 changing the developer while projects of the old one are assigned is refused with 400', async () => {
    const own = await project(developerA);
    const id = await createId({ projectIds: [own] });

    const refused = await patch(id, { developerId: developerB });
    expect(refused.status).toBe(400);
    expect(issues(refused)).toEqual([{ path: 'developerId', code: 'assigned_to_other_developer' }]);
    expect((await read(id)).developer.id).toBe(developerA);
    expect(await assignedIds(id)).toEqual([own]);

    // The operator clears the assignments first; then the developer can change.
    expect((await patch(id, { projectIds: [] })).status).toBe(200);
    const moved = await patch(id, { developerId: developerB });
    expect(moved.status).toBe(200);
    expect(moved.body.developer.id).toBe(developerB);
    expect((await patch(id, { developerId: randomUUID() })).status).toBe(400);
  });

  it('FR-DAT-02 the developer and its projects can change together when the result is consistent', async () => {
    const ofA = await project(developerA);
    const ofB = await project(developerB);
    const id = await createId({ projectIds: [ofA] });

    const moved = await patch(id, { developerId: developerB, projectIds: [ofB] });
    expect(moved.status).toBe(200);
    expect(moved.body.developer.id).toBe(developerB);
    expect(await assignedIds(id)).toEqual([ofB]);
  });

  it('FR-DAT-02 projectIds replaces the whole set', async () => {
    const [first, second, third] = [
      await project(developerA),
      await project(developerA),
      await project(developerA),
    ];
    const id = await createId({ projectIds: [first, second] });

    const replaced = await patch(id, { projectIds: [second, third] });
    expect(replaced.status).toBe(200);
    expect(replaced.body.projectCount).toBe(2);
    expect(await assignedIds(id)).toEqual([second, third].sort());

    // Leaving projectIds out keeps the set.
    await patch(id, { title: 'Senior sales manager' });
    expect(await assignedIds(id)).toEqual([second, third].sort());

    expect((await patch(id, { projectIds: [] })).body).toMatchObject({
      projectCount: 0,
      projects: [],
    });
  });

  it('FR-DAT-02 the set is replaced in one transaction: a refused request changes neither the contact nor its projects', async () => {
    const [first, second] = [await project(developerA), await project(developerA)];
    const foreign = await project(developerB);
    const id = await createId({ projectIds: [first, second], title: 'Sales manager' });
    const before = await read(id);

    const refused = await patch(id, { title: 'Changed', projectIds: [first, foreign] });
    expect(refused.status).toBe(400);
    const missing = await patch(id, { title: 'Changed', projectIds: [first, randomUUID()] });
    expect(missing.status).toBe(400);
    expect(issues(missing)).toEqual([{ path: 'projectIds', code: 'not_found' }]);

    expect(await read(id)).toEqual(before);
    expect(await assignedIds(id)).toEqual([first, second].sort());
  });

  it('FR-DAT-02 a contact is not created at all when its projects are refused', async () => {
    const name = `Ghost ${randomUUID().slice(0, 8)}`;
    const response = await create({ fullName: name, projectIds: [await project(developerB)] });
    expect(response.status).toBe(400);
    const { rows } = await h.db.query('SELECT 1 FROM sales_contacts WHERE full_name = $1', [name]);
    expect(rows).toHaveLength(0);
  });

  // ---------------------------------------------------------------- list

  it('FR-DAT-02 the list is paged and filters by developer, project and active status', async () => {
    const developerId = await fixtures.developer();
    const projectId = await project(developerId);
    const assigned = await createId({
      developerId,
      fullName: 'Amal Assigned',
      projectIds: [projectId],
    });
    const inactive = await createId({ developerId, fullName: 'Basel Inactive', isActive: false });
    const ids = (response: { body: { items: { id: string }[] } }) =>
      response.body.items.map((item) => item.id);

    const all = await h.get(`/content/sales-contacts?developerId=${developerId}`, session);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
    expect(ids(all)).toEqual([assigned, inactive]);
    expect(all.body.items[0]).toMatchObject({ phone: PHONE, projectCount: 1 });
    expect(all.body.items[0]).not.toHaveProperty('projects');

    expect(ids(await h.get(`/content/sales-contacts?projectId=${projectId}`, session))).toEqual([
      assigned,
    ]);
    expect(
      ids(await h.get(`/content/sales-contacts?developerId=${developerId}&active=false`, session)),
    ).toEqual([inactive]);
    expect(
      ids(await h.get(`/content/sales-contacts?developerId=${developerId}&active=true`, session)),
    ).toEqual([assigned]);

    const paged = await h.get(
      `/content/sales-contacts?developerId=${developerId}&page=2&pageSize=1`,
      session,
    );
    expect(paged.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(ids(paged)).toEqual([inactive]);
    expect((await h.get('/content/sales-contacts?pageSize=101', session)).status).toBe(400);
  });

  it('FR-CNT-01 the list searches the name and the title, never a phone number or an email', async () => {
    const developerId = await fixtures.developer();
    const mark = randomUUID().slice(0, 8);
    const phone = '+971507770001';
    const email = `find.${mark}@developer.example`;
    const id = await createId({
      developerId,
      fullName: `Nadia ${mark}`,
      title: `Director ${mark}`,
      phone,
      email,
    });
    const found = async (q: string) =>
      (
        await h.get(
          `/content/sales-contacts?developerId=${developerId}&q=${encodeURIComponent(q)}`,
          session,
        )
      ).body.items.map((item: { id: string }) => item.id);

    expect(await found(`nadia ${mark}`)).toEqual([id]);
    expect(await found(`director ${mark}`)).toEqual([id]);
    expect(await found(phone)).toEqual([]);
    expect(await found('7770001')).toEqual([]);
    expect(await found(email)).toEqual([]);
  });

  // ---------------------------------------------------------------- SalesContactReader

  describe('SalesContactReader', () => {
    it('FR-CNT-01 the listForProject result has no phone, WhatsApp or email keys at all', async () => {
      const projectId = await project(developerA);
      await createId({
        title: 'Sales manager',
        whatsapp: WHATSAPP,
        email: EMAIL,
        languages: ['ar', 'en'],
        projectIds: [projectId],
      });

      const contacts = await reader().listForProject(projectId);
      expect(contacts).toHaveLength(1);
      for (const contact of contacts) {
        expect(Object.keys(contact).sort()).toEqual(['fullName', 'id', 'languages', 'title']);
        expect(contact).not.toHaveProperty('phone');
        expect(contact).not.toHaveProperty('whatsapp');
        expect(contact).not.toHaveProperty('email');
      }
      expect(contacts[0]).toMatchObject({
        fullName: 'Sara Haddad',
        title: 'Sales manager',
        languages: ['ar', 'en'],
      });
      const text = JSON.stringify(contacts);
      for (const secret of [PHONE, WHATSAPP, EMAIL]) {
        expect(text).not.toContain(secret);
      }
    });

    it('FR-DAT-02 an inactive contact never appears in listForProject', async () => {
      const projectId = await project(developerA);
      const active = await createId({ fullName: 'Amal Active', projectIds: [projectId] });
      const inactive = await createId({
        fullName: 'Basel Inactive',
        projectIds: [projectId],
        isActive: false,
      });

      const listed = async () =>
        (await reader().listForProject(projectId)).map((contact) => contact.id);
      expect(await listed()).toEqual([active]);
      expect(await reader().findForProject(inactive, projectId)).toBeNull();

      // Deactivating removes a contact at once; reactivating brings it back.
      await patch(active, { isActive: false });
      expect(await listed()).toEqual([]);
      expect(await reader().findForProject(active, projectId)).toBeNull();
      await patch(inactive, { isActive: true });
      expect(await listed()).toEqual([inactive]);
    });

    it('FR-CNT-01 findForProject returns the numbers of an active contact assigned to the project', async () => {
      const projectId = await project(developerA);
      const otherProject = await project(developerA);
      const id = await createId({
        title: 'Sales manager',
        whatsapp: WHATSAPP,
        email: EMAIL,
        languages: ['ar'],
        projectIds: [projectId],
      });

      expect(await reader().findForProject(id, projectId)).toEqual({
        id,
        fullName: 'Sara Haddad',
        title: 'Sales manager',
        languages: ['ar'],
        phone: PHONE,
        whatsapp: WHATSAPP,
        email: EMAIL,
      });
      // Not through a project the contact is not assigned to, nor for an unknown contact.
      expect(await reader().findForProject(id, otherProject)).toBeNull();
      expect(await reader().findForProject(randomUUID(), projectId)).toBeNull();
      expect(await reader().listForProject(randomUUID())).toEqual([]);
    });

    it.each(['draft', 'archived'] as const)(
      'BR-08 a project that is %s gives [] from listForProject and null from findForProject',
      async (status) => {
        const projectId = await project(developerA, status);
        const id = await createId({ projectIds: [projectId] });

        expect(await reader().listForProject(projectId)).toEqual([]);
        expect(await reader().findForProject(id, projectId)).toBeNull();

        // The same contact is visible once the project is published.
        await h.db.query("UPDATE projects SET status = 'published' WHERE id = $1", [projectId]);
        expect((await reader().listForProject(projectId)).map((contact) => contact.id)).toEqual([
          id,
        ]);
        expect((await reader().findForProject(id, projectId))?.phone).toBe(PHONE);
      },
    );
  });

  // ---------------------------------------------------------------- log

  it('NFR-08 NFR-11 managing a contact writes no phone number, WhatsApp number or email to the log', async () => {
    const phone = '+971508880001';
    const whatsapp = '+971508880002';
    const email = `logged.${randomUUID().slice(0, 8)}@developer.example`;
    const id = await createId({ phone, whatsapp, email });
    await patch(id, { title: 'Sales manager' });
    await h.get(`/content/sales-contacts/${id}`, session);
    await h.get(`/content/sales-contacts?developerId=${developerA}`, session);
    await create({ phone, whatsapp, email, developerId: randomUUID() });

    // pino-http writes each line when the response finishes, so wait for the last request.
    await vi.waitFor(() =>
      expect(
        h
          .logEntries()
          .filter((entry) =>
            (entry.req as { url?: string } | undefined)?.url?.includes('/content/sales-contacts'),
          ).length,
      ).toBeGreaterThanOrEqual(5),
    );
    const log = h.logLines.join('\n');
    for (const secret of [phone, whatsapp, email]) {
      expect(log).not.toContain(secret);
    }
  });
});
