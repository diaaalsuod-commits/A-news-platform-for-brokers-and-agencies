import { randomUUID } from 'node:crypto';
import { areaSchema } from '@reih/contracts';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedAreas } from '../src/modules/content/index.js';
import { DATABASE } from '../src/shared/database/index.js';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

const DUBAI = { lng: 55.2708, lat: 25.2048 };
const MARINA = { lng: 55.1405, lat: 25.0805 };

describe('Areas (FR-DAT-03, FR-LOC-04)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
  });

  const mark = () => randomUUID().slice(0, 8);
  const emirateBody = (overrides: object = {}) => ({
    level: 'emirate',
    nameAr: `إمارة ${mark()}`,
    nameEn: `Emirate ${mark()}`,
    center: DUBAI,
    ...overrides,
  });
  const communityBody = (parentId: string, overrides: object = {}) => ({
    level: 'community',
    parentId,
    nameAr: `منطقة ${mark()}`,
    nameEn: `Community ${mark()}`,
    center: MARINA,
    ...overrides,
  });
  const create = (body: object) => h.post('/content/areas', { session, body });
  const createId = async (body: object) => {
    const response = await create(body);
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.id as string;
  };
  const patch = (id: string, body: object) =>
    h.send('patch', `/content/areas/${id}`, { session, body });
  const remove = (id: string) => h.send('delete', `/content/areas/${id}`, { session });
  const issues = (response: { body: { error: { details: { issues: unknown[] } } } }) =>
    response.body.error.details.issues;
  const ids = (response: { body: { items: { id: string }[] } }) =>
    response.body.items.map((item) => item.id);

  // ---------------------------------------------------------------- create and edit

  it('FR-DAT-03 creates an emirate and a community with names, descriptions and a center point', async () => {
    const emirate = await create(
      emirateBody({ descriptionAr: 'وصف الإمارة', descriptionEn: 'About the emirate' }),
    );
    expect(emirate.status).toBe(201);
    expect(areaSchema.safeParse(emirate.body).success).toBe(true);
    expect(emirate.body).toMatchObject({
      level: 'emirate',
      parentId: null,
      countryCode: 'AE',
      descriptionAr: 'وصف الإمارة',
      descriptionEn: 'About the emirate',
      center: DUBAI,
      isActive: true,
    });

    const community = await create(communityBody(emirate.body.id));
    expect(community.status).toBe(201);
    expect(community.body).toMatchObject({
      level: 'community',
      parentId: emirate.body.id,
      countryCode: 'AE',
      descriptionAr: null,
      center: MARINA,
    });
    const read = await h.get(`/content/areas/${community.body.id}`, session);
    expect(read.body).toEqual(community.body);
  });

  it('FR-DAT-03 an edit changes only the fields sent, the center included', async () => {
    const id = await createId(emirateBody({ descriptionEn: 'Before' }));
    const moved = await patch(id, { center: { lng: 54.3773, lat: 24.4539 }, nameEn: 'Renamed' });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({
      nameEn: 'Renamed',
      descriptionEn: 'Before',
      center: { lng: 54.3773, lat: 24.4539 },
    });
    expect((await patch(id, { descriptionEn: '' })).body.descriptionEn).toBeNull();
    expect((await patch(randomUUID(), { nameEn: 'Nobody' })).status).toBe(404);
  });

  it('FR-DAT-03 both names and the center are required', async () => {
    for (const change of [
      { nameAr: undefined },
      { nameEn: ' ' },
      { center: undefined },
      { center: { lng: 55.27 } },
      { center: { lng: '55.27', lat: '25.2' } },
      { center: { lng: 55.27, lat: 25.2, alt: 3 } },
      { level: 'city' },
    ]) {
      const response = await create(emirateBody(change));
      expect(response.status, JSON.stringify(change)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
  });

  // ---------------------------------------------------------------- FR-LOC-04

  it('FR-LOC-04 every area has country_code AE, set by the server', async () => {
    const emirateId = await createId(emirateBody());
    const communityId = await createId(communityBody(emirateId));
    const { rows } = await h.db.query('SELECT country_code FROM areas WHERE id = ANY($1::uuid[])', [
      [emirateId, communityId],
    ]);
    expect(rows.map((row: { country_code: string }) => row.country_code)).toEqual(['AE', 'AE']);
  });

  it('FR-LOC-04 the country is never accepted from the client', async () => {
    for (const extra of [{ countryCode: 'AE' }, { countryCode: 'SA' }, { country_code: 'SA' }]) {
      const response = await create(emirateBody(extra));
      expect(response.status, JSON.stringify(extra)).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    }
    const id = await createId(emirateBody());
    expect((await patch(id, { countryCode: 'SA' })).status).toBe(400);
    const { rows } = await h.db.query('SELECT country_code FROM areas WHERE id = $1', [id]);
    expect(rows[0].country_code).toBe('AE');
    const all = await h.db.query("SELECT count(*)::int AS n FROM areas WHERE country_code <> 'AE'");
    expect(all.rows[0].n).toBe(0);
  });

  it('FR-LOC-04 the seven seeded emirates and their communities are all in the UAE', async () => {
    await seedAreas(h.app.get(DATABASE));
    const emirates = await h.get('/content/areas?level=emirate&q=Abu%20Dhabi', session);
    expect(emirates.body.items).toHaveLength(1);
    expect(emirates.body.items[0]).toMatchObject({
      countryCode: 'AE',
      center: { lng: 54.3773, lat: 24.4539 },
    });
    const communities = await h.get(
      `/content/areas?level=community&parentId=${emirates.body.items[0].id}`,
      session,
    );
    expect(communities.body.total).toBe(4);

    // Every seeded center passes the same check a new area does.
    const { rows } = await h.db.query(
      `SELECT id, ST_X(center::geometry) AS lng, ST_Y(center::geometry) AS lat
       FROM areas WHERE level = 'emirate' AND name_en IN
         ('Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah')`,
    );
    expect(rows).toHaveLength(7);
    for (const row of rows as { id: string; lng: number; lat: number }[]) {
      const response = await patch(row.id, { center: { lng: row.lng, lat: row.lat } });
      expect(response.status).toBe(200);
    }
  });

  // ---------------------------------------------------------------- a community belongs to an emirate

  it('FR-DAT-03 a community must belong to an emirate', async () => {
    const emirateId = await createId(emirateBody());
    const communityId = await createId(communityBody(emirateId));

    const noParent = await create(communityBody(emirateId, { parentId: undefined }));
    expect(noParent.status).toBe(400);
    expect(issues(noParent)).toEqual([{ path: 'parentId', code: 'required' }]);

    const nullParent = await create(communityBody(emirateId, { parentId: null }));
    expect(issues(nullParent)).toEqual([{ path: 'parentId', code: 'required' }]);

    const underCommunity = await create(communityBody(communityId));
    expect(underCommunity.status).toBe(400);
    expect(issues(underCommunity)).toEqual([{ path: 'parentId', code: 'not_emirate' }]);

    const unknownParent = await create(communityBody(randomUUID()));
    expect(unknownParent.status).toBe(400);
    expect(issues(unknownParent)).toEqual([{ path: 'parentId', code: 'not_found' }]);
  });

  it('FR-DAT-03 an emirate has no parent', async () => {
    const emirateId = await createId(emirateBody());
    const onCreate = await create(emirateBody({ parentId: emirateId }));
    expect(onCreate.status).toBe(400);
    expect(issues(onCreate)).toEqual([{ path: 'parentId', code: 'not_allowed' }]);

    const other = await createId(emirateBody());
    const onUpdate = await patch(other, { parentId: emirateId });
    expect(onUpdate.status).toBe(400);
    expect(issues(onUpdate)).toEqual([{ path: 'parentId', code: 'not_allowed' }]);
  });

  it('FR-DAT-03 the level never changes; a community may move to another emirate only', async () => {
    const [first, second] = [await createId(emirateBody()), await createId(emirateBody())];
    const communityId = await createId(communityBody(first));
    const sibling = await createId(communityBody(first));

    expect((await patch(communityId, { level: 'emirate' })).status).toBe(400);
    expect((await patch(first, { level: 'community', parentId: second })).status).toBe(400);

    const moved = await patch(communityId, { parentId: second });
    expect(moved.status).toBe(200);
    expect(moved.body.parentId).toBe(second);

    const underCommunity = await patch(communityId, { parentId: sibling });
    expect(issues(underCommunity)).toEqual([{ path: 'parentId', code: 'not_emirate' }]);
    const underItself = await patch(communityId, { parentId: communityId });
    expect(issues(underItself)).toEqual([{ path: 'parentId', code: 'not_emirate' }]);
    expect((await patch(communityId, { parentId: randomUUID() })).status).toBe(400);
    expect((await patch(communityId, { parentId: null })).status).toBe(400);

    const { rows } = await h.db.query('SELECT level, parent_id FROM areas WHERE id = $1', [
      communityId,
    ]);
    expect(rows[0]).toEqual({ level: 'community', parent_id: second });
  });

  // ---------------------------------------------------------------- center point

  it('FR-DAT-03 a center with lng and lat swapped is refused', async () => {
    const swapped = { lng: DUBAI.lat, lat: DUBAI.lng };
    const onCreate = await create(emirateBody({ center: swapped }));
    expect(onCreate.status).toBe(400);
    expect(issues(onCreate)).toEqual([{ path: 'center', code: 'outside_uae' }]);

    const id = await createId(emirateBody());
    const onUpdate = await patch(id, { center: swapped });
    expect(onUpdate.status).toBe(400);
    expect(issues(onUpdate)).toEqual([{ path: 'center', code: 'outside_uae' }]);
    expect((await h.get(`/content/areas/${id}`, session)).body.center).toEqual(DUBAI);
  });

  it('FR-DAT-03 FR-LOC-04 a center outside the UAE box or outside the lng/lat ranges is refused', async () => {
    for (const center of [
      { lng: 46.6753, lat: 24.7136 }, // Riyadh
      { lng: 58.4059, lat: 23.588 }, // Muscat
      { lng: 0, lat: 0 },
      { lng: 181, lat: 25 },
      { lng: 55, lat: 91 },
      { lng: -55.27, lat: -25.2 },
    ]) {
      const response = await create(emirateBody({ center }));
      expect(response.status, JSON.stringify(center)).toBe(400);
      expect(issues(response)).toEqual([{ path: 'center', code: 'outside_uae' }]);
    }
  });

  // ---------------------------------------------------------------- delete and deactivate

  it('FR-DAT-03 an emirate that has communities cannot be deleted: 409, and it is still there', async () => {
    const emirateId = await createId(emirateBody());
    const communityId = await createId(communityBody(emirateId));

    const response = await remove(emirateId);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('AREA_IN_USE');
    expect((await h.get(`/content/areas/${emirateId}`, session)).status).toBe(200);

    // Once its last community is gone, the emirate can be deleted.
    expect((await remove(communityId)).status).toBe(204);
    expect((await remove(emirateId)).status).toBe(204);
    expect((await h.get(`/content/areas/${emirateId}`, session)).status).toBe(404);
  });

  it('FR-DAT-03 a community that a project uses cannot be deleted: 409; it is deactivated instead', async () => {
    const communityId = await createId(communityBody(await createId(emirateBody())));
    await fixtures.project({
      developerId: await fixtures.developer(),
      communityId,
      createdBy: operator.id,
    });

    const response = await remove(communityId);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('AREA_IN_USE');

    const deactivated = await patch(communityId, { isActive: false });
    expect(deactivated.status).toBe(200);
    expect(deactivated.body.isActive).toBe(false);
  });

  it('FR-DAT-03 an area that nothing uses is deleted; an unknown one is 404', async () => {
    const id = await createId(emirateBody());
    expect((await remove(id)).status).toBe(204);
    expect((await remove(id)).status).toBe(404);
  });

  // ---------------------------------------------------------------- list

  it('FR-DAT-03 the list is paged and filters by level, emirate, active status and name', async () => {
    const tag = mark();
    const emirateId = await createId(
      emirateBody({ nameEn: `Zeta ${tag} Emirate`, nameAr: `زيتا ${tag}` }),
    );
    const first = await createId(communityBody(emirateId, { nameEn: `Zeta ${tag} Alpha` }));
    const second = await createId(
      communityBody(emirateId, { nameEn: `Zeta ${tag} Beta`, isActive: false }),
    );

    const all = await h.get(`/content/areas?q=${encodeURIComponent(`zeta ${tag}`)}`, session);
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ total: 3, page: 1, pageSize: 20 });
    // Emirates first, then by English name.
    expect(ids(all)).toEqual([emirateId, first, second]);

    expect(ids(await h.get(`/content/areas?q=${tag}&level=emirate`, session))).toEqual([emirateId]);
    expect(ids(await h.get(`/content/areas?parentId=${emirateId}`, session))).toEqual([
      first,
      second,
    ]);
    expect(ids(await h.get(`/content/areas?parentId=${emirateId}&active=false`, session))).toEqual([
      second,
    ]);
    expect(
      ids(await h.get(`/content/areas?q=${encodeURIComponent(`زيتا ${tag}`)}`, session)),
    ).toEqual([emirateId]);

    const paged = await h.get(`/content/areas?parentId=${emirateId}&page=2&pageSize=1`, session);
    expect(paged.body).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(ids(paged)).toEqual([second]);
    expect((await h.get('/content/areas?pageSize=101', session)).status).toBe(400);
    expect((await h.get('/content/areas?level=city', session)).status).toBe(400);
  });
});
