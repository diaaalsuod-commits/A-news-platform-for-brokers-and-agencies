import { randomUUID } from 'node:crypto';
import { REFERENCE_INCLUDE_MAX } from '@reih/contracts';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useIdentityApp } from './support/identity-app.js';

interface Item {
  id: string;
  kind: string;
  nameEn: string;
  categoryId: string | null;
  isActive: boolean;
}

/**
 * GET /content/reference/:kind (P4.4 part b): the options of the Data Operator's forms, active
 * items by default, plus the included ids marked isActive false when they can no longer be chosen
 * (FR-ADM-04, FR-DAT-04, FR-DAT-08). Role checks are in content-access.e2e.test.ts.
 */
describe('Reference options for the content forms (FR-ADM-04, FR-DAT-04)', () => {
  const h = useIdentityApp();
  let operator: { id: string; email: string };
  let session: string;
  const tag = () => randomUUID().slice(0, 8);

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
  });

  const list = async (kind: string, include?: string[]) => {
    const query = include ? `?include=${include.join(',')}` : '';
    const response = await h.get(`/content/reference/${kind}${query}`, session);
    expect(response.status).toBe(200);
    return response.body.items as Item[];
  };

  async function propertyType(active: boolean): Promise<string> {
    const id = randomUUID();
    const code = `t_${tag()}`;
    await h.db.query(
      'INSERT INTO property_types (id, code, name_ar, name_en, is_active) VALUES ($1, $2, $3, $4, $5)',
      [id, code, `نوع ${code}`, `Type ${code}`, active],
    );
    return id;
  }

  async function category(active: boolean): Promise<string> {
    const id = randomUUID();
    await h.db.query(
      'INSERT INTO amenity_categories (id, name_ar, name_en, is_active) VALUES ($1, $2, $3, $4)',
      [id, `فئة ${tag()}`, `Category ${tag()}`, active],
    );
    return id;
  }

  async function amenity(categoryId: string, active: boolean): Promise<string> {
    const id = randomUUID();
    await h.db.query(
      'INSERT INTO amenities (id, category_id, name_ar, name_en, is_active) VALUES ($1, $2, $3, $4, $5)',
      [id, categoryId, `مرفق ${tag()}`, `Amenity ${tag()}`, active],
    );
    return id;
  }

  it('FR-ADM-04 lists the active items, in one unpaged list, all marked active', async () => {
    const active = await propertyType(true);
    const response = await h.get('/content/reference/property-types', session);
    expect(response.status).toBe(200);
    expect(Object.keys(response.body)).toEqual(['items']);
    const items = response.body.items as Item[];
    expect(items.map((item) => item.id)).toContain(active);
    expect(items.every((item) => item.isActive && item.kind === 'property-types')).toBe(true);
  });

  it('FR-ADM-04 an inactive item is absent unless included, and then marked isActive false', async () => {
    const inactive = await propertyType(false);
    expect((await list('property-types')).map((item) => item.id)).not.toContain(inactive);

    const included = (await list('property-types', [inactive])).filter(
      (item) => item.id === inactive,
    );
    expect(included).toHaveLength(1);
    expect(included[0]!.isActive).toBe(false);
    expect(included[0]!.nameEn).toMatch(/^Type t_/);
  });

  it('FR-ADM-04 an included active item is listed once, as active', async () => {
    const active = await propertyType(true);
    const items = await list('property-types', [active, active]);
    expect(items.filter((item) => item.id === active)).toEqual([
      expect.objectContaining({ id: active, isActive: true }),
    ]);
  });

  it('FR-ADM-04 an amenity of an inactive category is absent; included, it cannot be chosen', async () => {
    const closed = await category(false);
    const amenityId = await amenity(closed, true);
    expect((await list('amenities')).map((item) => item.id)).not.toContain(amenityId);

    const [included] = (await list('amenities', [amenityId])).filter(
      (item) => item.id === amenityId,
    );
    expect(included).toMatchObject({ id: amenityId, categoryId: closed, isActive: false });

    // The category itself names the group when included (amenity categories are a kind too).
    expect((await list('amenity-categories')).map((item) => item.id)).not.toContain(closed);
    const [group] = (await list('amenity-categories', [closed])).filter(
      (item) => item.id === closed,
    );
    expect(group).toMatchObject({ id: closed, isActive: false });
  });

  it('FR-ADM-04 a deactivated amenity of an active category is included as isActive false', async () => {
    const open = await category(true);
    const off = await amenity(open, false);
    const on = await amenity(open, true);
    const items = await list('amenities', [off]);
    expect(items.find((item) => item.id === on)).toMatchObject({ isActive: true });
    expect(items.find((item) => item.id === off)).toMatchObject({ isActive: false });
  });

  it('an unknown id in include is ignored', async () => {
    const unknown = randomUUID();
    expect((await list('layouts', [unknown])).map((item) => item.id)).not.toContain(unknown);
  });

  it('every kind answers', async () => {
    for (const kind of [
      'property-types',
      'layouts',
      'unit-levels',
      'furnishing-types',
      'unit-tags',
      'amenity-categories',
      'amenities',
    ]) {
      expect((await h.get(`/content/reference/${kind}`, session)).status, kind).toBe(200);
    }
  });

  it.each([
    ['a malformed id', '?include=not-a-uuid'],
    ['an empty include', '?include='],
    ['an empty entry', `?include=${randomUUID()},`],
    [
      `more than ${REFERENCE_INCLUDE_MAX} ids`,
      `?include=${Array.from({ length: REFERENCE_INCLUDE_MAX + 1 }, () => randomUUID()).join(',')}`,
    ],
    ['a repeated parameter', `?include=${randomUUID()}&include=${randomUUID()}`],
    ['an unknown parameter', '?page=1'],
  ])('%s is refused with 400', async (_name, query) => {
    const response = await h.get(`/content/reference/amenities${query}`, session);
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_FAILED');
  });

  it(`${REFERENCE_INCLUDE_MAX} ids are accepted`, async () => {
    const ids = Array.from({ length: REFERENCE_INCLUDE_MAX }, () => randomUUID());
    expect(
      (await h.get(`/content/reference/amenities?include=${ids.join(',')}`, session)).status,
    ).toBe(200);
  });

  it('an unknown kind is refused with 400', async () => {
    const response = await h.get('/content/reference/developers', session);
    expect(response.status).toBe(400);
  });
});
