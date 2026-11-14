import { projectSchema, projectSummarySchema } from '@reih/contracts';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

describe('Projects (FR-DAT-04)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;
  let developerId: string;
  let emirateId: string;
  let communityId: string;

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
    developerId = await fixtures.developer();
    emirateId = await fixtures.emirate();
    communityId = await fixtures.community(emirateId);
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
  });

  const base = () => ({
    nameAr: 'أبراج الواحة',
    nameEn: 'Oasis Towers',
    developerId,
    communityId,
    location: { lng: 55.14, lat: 25.08 },
    stage: 'under_construction',
    ownershipType: 'freehold',
  });
  const create = (body: object = base()) => h.post('/content/projects', { session, body });
  const createId = async (body: object = base()) => {
    const response = await create(body);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };
  const patch = (id: string, body: object) =>
    h.send('patch', `/content/projects/${id}`, { session, body });
  const issues = (response: { body: { error: { details: { issues: unknown[] } } } }) =>
    response.body.error.details.issues;

  // ---------------------------------------------------------------- create and read

  it('FR-DAT-04 a new project starts as a draft, with every field stored', async () => {
    const amenityId = await fixtures.amenity();
    const body = {
      ...base(),
      descriptionAr: 'وصف خيالي.',
      descriptionEn: 'A fictional project.',
      expectedLaunchDate: '2027-03-01',
      expectedHandover: { quarter: 4, year: 2029 },
      actualHandoverDate: null,
      ownershipType: 'leasehold',
      leaseTermYears: 99,
      serviceChargeAedPerSqm: '18.50',
      amenityIds: [amenityId],
    };
    const response = await create(body);

    expect(response.status).toBe(201);
    expect(projectSchema.safeParse(response.body).success).toBe(true);
    expect(response.body).toMatchObject({
      status: 'draft',
      publishedAt: null,
      lastVerifiedAt: null,
      nameEn: 'Oasis Towers',
      location: { lng: 55.14, lat: 25.08 },
      expectedLaunchDate: '2027-03-01',
      expectedHandover: { quarter: 4, year: 2029 },
      ownershipType: 'leasehold',
      leaseTermYears: 99,
      serviceChargeAedPerSqm: '18.50',
      amenityIds: [amenityId],
      developer: { id: developerId, status: 'active' },
      community: { id: communityId, isActive: true },
    });
    const read = await h.get(`/content/projects/${response.body.id}`, session);
    expect(read.status).toBe(200);
    expect(read.body).toEqual(response.body);
    const row = await h.db.query('SELECT created_by, updated_by FROM projects WHERE id = $1', [
      response.body.id,
    ]);
    expect(row.rows[0]).toEqual({ created_by: operator.id, updated_by: operator.id });
  });

  it('FR-DAT-04 a status cannot be sent; required fields and unknown fields are refused with 400', async () => {
    for (const body of [
      { ...base(), status: 'published' },
      { ...base(), nameAr: '  ' },
      { ...base(), location: undefined },
      { ...base(), stage: 'planned' },
      { ...base(), location: { lng: 181, lat: 25 } },
      { ...base(), location: { lng: 55, lat: -91 } },
      { ...base(), serviceChargeAedPerSqm: 18.5 },
      { ...base(), serviceChargeAedPerSqm: '18.505' },
      { ...base(), expectedHandover: { quarter: 5, year: 2029 } },
      { ...base(), expectedHandover: { quarter: 2 } },
      { ...base(), unknown: true },
    ]) {
      const response = await create(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  it('FR-DAT-04 Q3 any valid point is saved, even outside the UAE (publishing checks it)', async () => {
    const response = await create({ ...base(), location: { lng: 58.4, lat: 23.6 } });
    expect(response.status).toBe(201);
    expect(response.body.location).toEqual({ lng: 58.4, lat: 23.6 });
  });

  it('FR-DAT-04 a leasehold needs a lease term and a freehold refuses one, also after an edit', async () => {
    expect(issues(await create({ ...base(), ownershipType: 'leasehold' }))).toEqual([
      { path: 'leaseTermYears', code: 'required' },
    ]);
    expect(issues(await create({ ...base(), leaseTermYears: 30 }))).toEqual([
      { path: 'leaseTermYears', code: 'not_allowed' },
    ]);
    const id = await createId();
    expect(issues(await patch(id, { ownershipType: 'leasehold' }))).toEqual([
      { path: 'leaseTermYears', code: 'required' },
    ]);
    const changed = await patch(id, { ownershipType: 'leasehold', leaseTermYears: 50 });
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ ownershipType: 'leasehold', leaseTermYears: 50 });
  });

  it('BR-05 the expected handover and the actual handover date are separate fields', async () => {
    const id = await createId({ ...base(), expectedHandover: { quarter: 2, year: 2028 } });

    const handedOver = await patch(id, { actualHandoverDate: '2028-09-15' });
    expect(handedOver.body).toMatchObject({
      expectedHandover: { quarter: 2, year: 2028 },
      actualHandoverDate: '2028-09-15',
    });
    const cleared = await patch(id, { expectedHandover: null });
    expect(cleared.body).toMatchObject({
      expectedHandover: null,
      actualHandoverDate: '2028-09-15',
    });
    const row = await h.db.query(
      'SELECT handover_quarter, handover_year, actual_handover_date::text AS actual FROM projects WHERE id = $1',
      [id],
    );
    expect(row.rows[0]).toEqual({
      handover_quarter: null,
      handover_year: null,
      actual: '2028-09-15',
    });
  });

  it('FR-DAT-04 D the expected launch date is optional and kept when the stage changes', async () => {
    const without = await create({ ...base(), stage: 'upcoming' });
    expect(without.status).toBe(201);
    expect(without.body.expectedLaunchDate).toBeNull();

    const id = await createId({ ...base(), stage: 'upcoming', expectedLaunchDate: '2027-01-10' });
    for (const stage of ['under_construction', 'ready', 'upcoming']) {
      const changed = await patch(id, { stage });
      expect(changed.status).toBe(200);
      expect(changed.body).toMatchObject({ stage, expectedLaunchDate: '2027-01-10' });
    }
  });

  it('FR-DAT-04 FR-DAT-01 the developer must exist and be active', async () => {
    const archived = await fixtures.developer('archived');
    expect(issues(await create({ ...base(), developerId: archived }))).toEqual([
      { path: 'developerId', code: 'archived' },
    ]);
    expect(
      issues(await create({ ...base(), developerId: '00000000-0000-4000-8000-000000000000' })),
    ).toEqual([{ path: 'developerId', code: 'not_found' }]);
  });

  it('FR-DAT-03 Q7 the area is a community; a deactivated one is refused when new but kept', async () => {
    expect(issues(await create({ ...base(), communityId: emirateId }))).toEqual([
      { path: 'communityId', code: 'not_community' },
    ]);
    const closing = await fixtures.community(emirateId);
    const id = await createId({ ...base(), communityId: closing });
    await h.db.query('UPDATE areas SET is_active = false WHERE id = $1', [closing]);

    expect(issues(await create({ ...base(), communityId: closing }))).toEqual([
      { path: 'communityId', code: 'inactive' },
    ]);
    const kept = await patch(id, { nameEn: 'Renamed', communityId: closing });
    expect(kept.status).toBe(200);
    expect(kept.body.community).toMatchObject({ id: closing, isActive: false });
  });

  it('FR-DAT-04 FR-ADM-04 Q7 a deactivated amenity is refused when new but stays on a project that has it', async () => {
    const kept = await fixtures.amenity();
    const other = await fixtures.amenity();
    const id = await createId({ ...base(), amenityIds: [kept] });
    await h.db.query('UPDATE amenities SET is_active = false WHERE id = ANY($1)', [[kept, other]]);

    expect(issues(await create({ ...base(), amenityIds: [kept] }))).toEqual([
      { path: 'amenityIds', code: 'inactive_or_unknown' },
    ]);
    expect(issues(await patch(id, { amenityIds: [kept, other] }))).toEqual([
      { path: 'amenityIds', code: 'inactive_or_unknown' },
    ]);
    const renamed = await patch(id, { nameEn: 'Still has it' });
    expect(renamed.body.amenityIds).toEqual([kept]);
    const resent = await patch(id, { amenityIds: [kept] });
    expect(resent.status).toBe(200);
    expect(resent.body.amenityIds).toEqual([kept]);
    const removed = await patch(id, { amenityIds: [] });
    expect(removed.body.amenityIds).toEqual([]);
  });

  it('FR-DAT-02 2b a developer change is refused while sales contacts are assigned', async () => {
    const otherDeveloper = await fixtures.developer();
    const id = await createId();
    const contact = await h.post('/content/sales-contacts', {
      session,
      body: { developerId, fullName: 'Sara Contact', phone: '+971501234567', projectIds: [id] },
    });
    expect(contact.status).toBe(201);

    expect(issues(await patch(id, { developerId: otherDeveloper }))).toEqual([
      { path: 'developerId', code: 'has_assigned_contacts' },
    ]);
    const cleared = await h.send('patch', `/content/sales-contacts/${contact.body.id}`, {
      session,
      body: { projectIds: [] },
    });
    expect(cleared.status).toBe(200);
    const moved = await patch(id, { developerId: otherDeveloper });
    expect(moved.status).toBe(200);
    expect(moved.body.developer.id).toBe(otherDeveloper);
  });

  // ---------------------------------------------------------------- lists

  it('FR-DAT-04 lists projects with filters and q on either name, paged', async () => {
    const tag = `Paging${Date.now()}`;
    const draft = await createId({ ...base(), nameEn: `${tag} Alpha` });
    await createId({ ...base(), nameEn: `${tag} Beta`, stage: 'ready' });

    const page = await h.get(`/content/projects?q=${tag}&pageSize=1`, session);
    expect(page.status).toBe(200);
    expect(page.body).toMatchObject({ total: 2, page: 1, pageSize: 1 });
    expect(page.body.items[0]).toMatchObject({ id: draft, status: 'draft' });
    expect(projectSummarySchema.safeParse(page.body.items[0]).success).toBe(true);

    const ready = await h.get(`/content/projects?q=${tag}&stage=ready`, session);
    expect(ready.body.items.map((item: { nameEn: string }) => item.nameEn)).toEqual([
      `${tag} Beta`,
    ]);
    expect((await h.get('/content/projects?status=unknown', session)).status).toBe(400);
  });

  it('C GET /content/projects/needs-verification is not taken for a project id', async () => {
    const response = await h.get('/content/projects/needs-verification', session);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 20 });
    expect(Array.isArray(response.body.items)).toBe(true);
  });

  it('an unknown or malformed project id answers 404 or 400', async () => {
    expect(
      (await h.get('/content/projects/00000000-0000-4000-8000-000000000000', session)).status,
    ).toBe(404);
    expect((await h.get('/content/projects/not-a-uuid', session)).status).toBe(400);
  });

  // ---------------------------------------------------------------- archived is read-only

  it('FR-DAT-04 Q4 an archived project is read-only, but can still be read', async () => {
    const id = await createId();
    const archived = await h.post(`/content/projects/${id}/archive`, { session });
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');

    const edit = await patch(id, { nameEn: 'Changed' });
    expect(edit.status).toBe(409);
    expect(edit.body.error.code).toBe('PROJECT_ARCHIVED');
    const verify = await h.post(`/content/projects/${id}/verify`, {
      session,
      body: { date: '2026-11-01', source: 'Developer sales office' },
    });
    expect(verify.status).toBe(409);
    expect(verify.body.error.code).toBe('PROJECT_ARCHIVED');
    for (const action of ['publish', 'unpublish', 'archive']) {
      const response = await h.post(`/content/projects/${id}/${action}`, { session });
      expect(response.status, action).toBe(409);
      expect(response.body.error.code).toBe('PROJECT_ARCHIVED');
    }
    const read = await h.get(`/content/projects/${id}`, session);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ status: 'archived', nameEn: 'Oasis Towers' });
  });
});
