import { randomUUID } from 'node:crypto';
import { AMENITY_ICON_KEYS, type ReferenceKind } from '@reih/contracts';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ReferenceDataReader } from '../src/modules/admin/index.js';
import { useIdentityApp } from './support/identity-app.js';

const tag = () => randomUUID().replace(/-/g, '').slice(0, 10);

/** A valid creation body for each kind. */
function bodyFor(kind: ReferenceKind, categoryId?: string): Record<string, unknown> {
  const names = { nameAr: `اسم ${tag()}`, nameEn: `Name ${tag()}` };
  switch (kind) {
    case 'layouts':
      return { code: `l_${tag()}`, bedrooms: 2, ...names };
    case 'amenity-categories':
      return { ...names, icon: 'pool', sortOrder: 3 };
    case 'amenities':
      return { categoryId, ...names, icon: 'gym' };
    default:
      return { code: `c_${tag()}`, sortOrder: 1, ...names };
  }
}

const KINDS: ReferenceKind[] = [
  'property-types',
  'layouts',
  'unit-levels',
  'furnishing-types',
  'unit-tags',
  'amenity-categories',
  'amenities',
];

describe('Platform Admin: reference data (FR-ADM-04)', () => {
  const h = useIdentityApp();
  let admin: { id: string; email: string };
  let session: string;
  let categoryId: string;

  beforeAll(async () => {
    admin = await h.createUser({ role: 'platform_admin' });
  });

  beforeEach(async () => {
    session = await h.sessionFor(admin.email);
    if (!categoryId) {
      categoryId = (await create('amenity-categories')).id;
    }
  });

  async function create(kind: ReferenceKind, body = bodyFor(kind, categoryId)) {
    const response = await h.post(`/admin/reference/${kind}`, { session, body });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body as { id: string; code: string | null; isActive: boolean };
  }

  /** A project that uses an amenity, written as the content module will (FR-DAT-04). */
  async function projectUsing(amenityId: string): Promise<void> {
    const [developer, emirate, community, project] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    await h.db.query(
      `INSERT INTO developers (id, name_ar, name_en) VALUES ($1, 'مطور', 'Developer')`,
      [developer],
    );
    await h.db.query(
      `INSERT INTO areas (id, parent_id, level, name_ar, name_en, center)
       VALUES ($1, NULL, 'emirate', 'دبي', 'Dubai', ST_GeogFromText('POINT(55.27 25.20)')),
              ($2, $1, 'community', 'مجتمع', 'Community', ST_GeogFromText('POINT(55.28 25.21)'))`,
      [emirate, community],
    );
    await h.db.query(
      `INSERT INTO projects (id, developer_id, community_id, name_ar, name_en, location, stage,
         ownership_type, created_by, updated_by)
       VALUES ($1, $2, $3, 'مشروع', 'Project', ST_GeogFromText('POINT(55.28 25.21)'), 'ready',
         'freehold', $4, $4)`,
      [project, developer, community, admin.id],
    );
    await h.db.query('INSERT INTO project_amenities (project_id, amenity_id) VALUES ($1, $2)', [
      project,
      amenityId,
    ]);
  }

  describe.each(KINDS)('FR-ADM-04 %s', (kind) => {
    it(`FR-ADM-04 creates, reads, lists, edits and deletes ${kind}`, async () => {
      const body = bodyFor(kind, categoryId);
      const created = await create(kind, body);
      expect(created).toMatchObject({
        kind,
        nameAr: body.nameAr,
        nameEn: body.nameEn,
        isActive: true,
      });

      const read = await h.get(`/admin/reference/${kind}/${created.id}`, session);
      expect(read.status).toBe(200);

      const listed = await h.get(
        `/admin/reference/${kind}?q=${encodeURIComponent(body.nameEn as string)}`,
        session,
      );
      expect(listed.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });

      const edited = await h.send('patch', `/admin/reference/${kind}/${created.id}`, {
        session,
        body: { nameEn: 'Edited name' },
      });
      expect(edited.status).toBe(200);
      expect(edited.body.nameEn).toBe('Edited name');

      const deleted = await h.send('delete', `/admin/reference/${kind}/${created.id}`, { session });
      expect(deleted.status).toBe(204);
      expect((await h.get(`/admin/reference/${kind}/${created.id}`, session)).status).toBe(404);
    });

    it(`FR-ADM-04 ${kind} needs both the Arabic and the English name`, async () => {
      for (const missing of ['nameAr', 'nameEn']) {
        const body = bodyFor(kind, categoryId);
        delete body[missing];
        const response = await h.post(`/admin/reference/${kind}`, { session, body });
        expect(response.status).toBe(400);
        expect(response.body.error.code).toBe('VALIDATION_FAILED');
      }
    });
  });

  it('FR-ADM-04 a code is unique within its kind and fixed once created', async () => {
    const first = await create('property-types');
    const duplicate = await h.post('/admin/reference/property-types', {
      session,
      body: { ...bodyFor('property-types'), code: first.code },
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CODE_TAKEN');

    const sameCodeOtherKind = await h.post('/admin/reference/unit-tags', {
      session,
      body: { ...bodyFor('unit-tags'), code: first.code },
    });
    expect(sameCodeOtherKind.status).toBe(201);

    const change = await h.send('patch', `/admin/reference/property-types/${first.id}`, {
      session,
      body: { code: 'other_code' },
    });
    expect(change.status).toBe(400);
  });

  it('FR-ADM-04 icons are optional keys from the fixed list, only on amenities and categories', async () => {
    const noIcon = await h.post('/admin/reference/amenity-categories', {
      session,
      body: { nameAr: 'فئة', nameEn: 'Category' },
    });
    expect(noIcon.status).toBe(201);
    expect(noIcon.body.icon).toBeNull();

    const unknownKey = await h.post('/admin/reference/amenities', {
      session,
      body: { ...bodyFor('amenities', categoryId), icon: 'https://example.test/icon.svg' },
    });
    expect(unknownKey.status).toBe(400);
    expect(AMENITY_ICON_KEYS).not.toContain('https://example.test/icon.svg');

    const iconOnPropertyType = await h.post('/admin/reference/property-types', {
      session,
      body: { ...bodyFor('property-types'), icon: 'pool' },
    });
    expect(iconOnPropertyType.status).toBe(400);
  });

  it('FR-ADM-04 an unknown kind is refused', async () => {
    expect((await h.get('/admin/reference/colours', session)).status).toBe(400);
  });

  describe('FR-ADM-04 items in use are deactivated, not deleted', () => {
    it('FR-ADM-04 an amenity used by a project cannot be deleted, but can be deactivated', async () => {
      const amenity = await create('amenities');
      await projectUsing(amenity.id);

      const deleted = await h.send('delete', `/admin/reference/amenities/${amenity.id}`, {
        session,
      });
      expect(deleted.status).toBe(409);
      expect(deleted.body.error.code).toBe('REFERENCE_IN_USE');
      const links = await h.db.query('SELECT 1 FROM project_amenities WHERE amenity_id = $1', [
        amenity.id,
      ]);
      expect(links.rowCount).toBe(1);

      const deactivated = await h.send('patch', `/admin/reference/amenities/${amenity.id}`, {
        session,
        body: { isActive: false },
      });
      expect(deactivated.status).toBe(200);
      expect(deactivated.body.isActive).toBe(false);
    });

    it('FR-ADM-04 a category that still has amenities cannot be deleted', async () => {
      const category = await create('amenity-categories');
      await create('amenities', bodyFor('amenities', category.id));
      const deleted = await h.send('delete', `/admin/reference/amenity-categories/${category.id}`, {
        session,
      });
      expect(deleted.status).toBe(409);
      expect(deleted.body.error.code).toBe('REFERENCE_IN_USE');
    });

    it('FR-ADM-04 a deactivated amenity no longer appears in new selections', async () => {
      const reader = h.app.get(ReferenceDataReader);
      const amenity = await create('amenities');
      expect((await reader.listActive('amenities')).map((item) => item.id)).toContain(amenity.id);
      expect(await reader.areActive('amenities', [amenity.id])).toBe(true);

      await h.send('patch', `/admin/reference/amenities/${amenity.id}`, {
        session,
        body: { isActive: false },
      });
      expect((await reader.listActive('amenities')).map((item) => item.id)).not.toContain(
        amenity.id,
      );
      expect(await reader.areActive('amenities', [amenity.id])).toBe(false);

      const activeOnly = await h.get(
        '/admin/reference/amenities?active=true&pageSize=100',
        session,
      );
      expect(activeOnly.body.items.map((item: { id: string }) => item.id)).not.toContain(
        amenity.id,
      );
      const inactiveOnly = await h.get(
        '/admin/reference/amenities?active=false&pageSize=100',
        session,
      );
      expect(inactiveOnly.body.items.map((item: { id: string }) => item.id)).toContain(amenity.id);
    });

    it('FR-ADM-04 a deactivated category hides its amenities and takes no new ones', async () => {
      const reader = h.app.get(ReferenceDataReader);
      const category = await create('amenity-categories');
      const amenity = await create('amenities', bodyFor('amenities', category.id));
      await h.send('patch', `/admin/reference/amenity-categories/${category.id}`, {
        session,
        body: { isActive: false },
      });
      expect(await reader.areActive('amenities', [amenity.id])).toBe(false);

      const response = await h.post('/admin/reference/amenities', {
        session,
        body: bodyFor('amenities', category.id),
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('AMENITY_CATEGORY_INACTIVE');
    });

    it('FR-ADM-04 a deactivated property type no longer appears in new selections', async () => {
      const reader = h.app.get(ReferenceDataReader);
      const type = await create('property-types');
      await h.send('patch', `/admin/reference/property-types/${type.id}`, {
        session,
        body: { isActive: false },
      });
      expect((await reader.listActive('property-types')).map((item) => item.id)).not.toContain(
        type.id,
      );
    });
  });
});
