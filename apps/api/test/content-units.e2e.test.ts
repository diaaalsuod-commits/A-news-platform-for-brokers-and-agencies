import type pg from 'pg';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DB_POOL } from '../src/shared/database/database.tokens.js';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

type Body = Record<string, unknown>;

/** FR-DAT-08, FR-DAT-09, BR-16, UC-05.9: units, managed by Data Operators. */
describe('Units (FR-DAT-08, FR-DAT-09, BR-16)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;
  let developerId: string;
  let communityId: string;
  const ref = {} as {
    propertyType: string;
    otherPropertyType: string;
    layout: string;
    otherLayout: string;
    unitLevel: string;
    furnishing: string;
    tag: string;
    otherTag: string;
  };

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
    developerId = await fixtures.developer();
    communityId = await fixtures.community(await fixtures.emirate());
    ref.propertyType = await fixtures.reference('property_types');
    ref.otherPropertyType = await fixtures.reference('property_types');
    ref.layout = await fixtures.reference('layouts');
    ref.otherLayout = await fixtures.reference('layouts');
    ref.unitLevel = await fixtures.reference('unit_levels');
    ref.furnishing = await fixtures.reference('furnishing_types');
    ref.tag = await fixtures.reference('unit_tags');
    ref.otherTag = await fixtures.reference('unit_tags');
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
  });

  const newProject = (status: 'draft' | 'published' | 'archived' = 'draft') =>
    fixtures.project({ developerId, communityId, createdBy: operator.id, status });

  const unitsOf = (projectId: string) => `/content/projects/${projectId}/units`;
  let counter = 0;
  const unitBody = (overrides: Body = {}): Body => ({
    unitNumber: `U-${(counter += 1)}`,
    propertyTypeId: ref.propertyType,
    layoutId: ref.layout,
    internalAreaSqm: '80.50',
    totalAreaSqm: '95',
    floorLabel: '5',
    priceAed: '1250000',
    ...overrides,
  });
  const createUnit = (projectId: string, overrides: Body = {}) =>
    h.post(unitsOf(projectId), { session, body: unitBody(overrides) });
  const patchUnit = (projectId: string, unitId: string, body: Body) =>
    h.send('patch', `${unitsOf(projectId)}/${unitId}`, { session, body });

  async function historyOf(unitId: string) {
    const { rows } = await h.db.query(
      `SELECT field, old_value, new_value, changed_by, changed_at FROM unit_history
       WHERE unit_id = $1 ORDER BY changed_at, field`,
      [unitId],
    );
    return rows as {
      field: string;
      old_value: string | null;
      new_value: string;
      changed_by: string;
      changed_at: Date;
    }[];
  }

  async function unitCount(projectId: string): Promise<number> {
    const { rows } = await h.db.query(
      'SELECT count(*)::int AS n FROM units WHERE project_id = $1',
      [projectId],
    );
    return rows[0].n as number;
  }

  describe('create', () => {
    it('FR-DAT-08 stores every field, with the floor sort key, and starts without history', async () => {
      const projectId = await newProject();
      const floorPlan = await fixtures.media(projectId, operator.id, { type: 'floor_plan' });
      const response = await createUnit(projectId, {
        unitNumber: 'A-1204',
        unitLevelId: ref.unitLevel,
        furnishingTypeId: ref.furnishing,
        bathrooms: 2,
        floorLabel: 'm',
        view: 'Sea view',
        status: 'reserved',
        tagIds: [ref.tag, ref.otherTag],
        floorPlanMediaId: floorPlan,
      });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        projectId,
        unitNumber: 'A-1204',
        propertyTypeId: ref.propertyType,
        layoutId: ref.layout,
        unitLevelId: ref.unitLevel,
        furnishingTypeId: ref.furnishing,
        bathrooms: 2,
        internalAreaSqm: '80.50',
        totalAreaSqm: '95.00',
        floorLabel: 'M',
        floorSortKey: 1,
        view: 'Sea view',
        priceAed: '1250000.00',
        status: 'reserved',
        floorPlanMediaId: floorPlan,
        history: [],
      });
      expect([...response.body.tagIds].sort()).toEqual([ref.tag, ref.otherTag].sort());
      expect(await historyOf(response.body.id)).toEqual([]);
    });

    it('FR-DAT-08 a new unit is available unless a status is given; optional fields are null', async () => {
      const projectId = await newProject();
      const response = await h.post(unitsOf(projectId), {
        session,
        body: {
          unitNumber: '101',
          propertyTypeId: ref.propertyType,
          layoutId: ref.layout,
          internalAreaSqm: '60',
          priceAed: '900000.5',
        },
      });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        status: 'available',
        priceAed: '900000.50',
        totalAreaSqm: null,
        floorLabel: null,
        floorSortKey: null,
        view: null,
        bathrooms: null,
        unitLevelId: null,
        furnishingTypeId: null,
        tagIds: [],
        floorPlanMediaId: null,
      });
    });

    it('FR-DAT-08 a duplicate unit number is refused (409 UNIT_NUMBER_TAKEN)', async () => {
      const projectId = await newProject();
      expect((await createUnit(projectId, { unitNumber: 'B-7' })).status).toBe(201);
      const response = await createUnit(projectId, { unitNumber: 'B-7' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('UNIT_NUMBER_TAKEN');
      expect(await unitCount(projectId)).toBe(1);
    });

    it('FR-DAT-08 the unique constraint decides between two concurrent units with one number', async () => {
      const projectId = await newProject();
      const responses = await Promise.all([
        createUnit(projectId, { unitNumber: 'RACE-1' }),
        createUnit(projectId, { unitNumber: 'RACE-1' }),
      ]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await unitCount(projectId)).toBe(1);
    });

    it('FR-DAT-08 renaming a unit to a number its project already has is refused', async () => {
      const projectId = await newProject();
      await createUnit(projectId, { unitNumber: 'C-1' });
      const second = await createUnit(projectId, { unitNumber: 'C-2' });
      const response = await patchUnit(projectId, second.body.id, { unitNumber: 'C-1' });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('UNIT_NUMBER_TAKEN');
    });

    it('FR-DAT-08 the same unit number is accepted in another project', async () => {
      const first = await newProject();
      const second = await newProject();
      expect((await createUnit(first, { unitNumber: 'D-1' })).status).toBe(201);
      expect((await createUnit(second, { unitNumber: 'D-1' })).status).toBe(201);
    });

    it('FR-DAT-08 prices and areas are decimal strings with at most two decimals, never numbers', async () => {
      const projectId = await newProject();
      const cases: [Body, string][] = [
        [{ priceAed: 1250000 }, 'priceAed'],
        [{ priceAed: '1250000.123' }, 'priceAed'],
        [{ priceAed: '1e6' }, 'priceAed'],
        [{ priceAed: '1234567890123' }, 'priceAed'],
        [{ internalAreaSqm: 80 }, 'internalAreaSqm'],
        [{ internalAreaSqm: '80.555' }, 'internalAreaSqm'],
        [{ totalAreaSqm: '123456789' }, 'totalAreaSqm'],
      ];
      for (const [overrides, path] of cases) {
        const response = await createUnit(projectId, overrides);
        expect(response.status, JSON.stringify(overrides)).toBe(400);
        expect(response.body.error.details.issues[0].path).toBe(path);
      }
      expect(await unitCount(projectId)).toBe(0);
    });

    it('FR-DAT-08 a price is greater than 0 and required unless the unit is on request', async () => {
      const projectId = await newProject();
      const zero = await createUnit(projectId, { priceAed: '0.00' });
      expect(zero.body.error.details.issues).toEqual([{ path: 'priceAed', code: 'out_of_range' }]);
      for (const status of ['available', 'reserved', 'sold']) {
        const response = await createUnit(projectId, { status, priceAed: null });
        expect(response.status).toBe(400);
        expect(response.body.error.details.issues).toEqual([
          { path: 'priceAed', code: 'required' },
        ]);
      }
      const onRequest = await createUnit(projectId, { status: 'on_request', priceAed: null });
      expect(onRequest.status).toBe(201);
      expect(onRequest.body.priceAed).toBeNull();
    });

    it('FR-DAT-08 the internal area may not exceed the total area', async () => {
      const projectId = await newProject();
      const refused = await createUnit(projectId, {
        internalAreaSqm: '100.01',
        totalAreaSqm: '100',
      });
      expect(refused.status).toBe(400);
      expect(refused.body.error.details.issues).toEqual([
        { path: 'internalAreaSqm', code: 'exceeds_total' },
      ]);
      const equal = await createUnit(projectId, { internalAreaSqm: '100', totalAreaSqm: '100.00' });
      expect(equal.status).toBe(201);

      const larger = await patchUnit(projectId, equal.body.id, { internalAreaSqm: '120' });
      expect(larger.body.error.details.issues).toEqual([
        { path: 'internalAreaSqm', code: 'exceeds_total' },
      ]);
    });

    it('FR-UNT-03 an unknown floor label is refused with 400 rather than guessed', async () => {
      const projectId = await newProject();
      for (const floorLabel of ['LG', 'P1', 'M2', 'Roof', '0', '201', 'B6']) {
        const response = await createUnit(projectId, { floorLabel });
        expect(response.status, floorLabel).toBe(400);
        expect(response.body.error.details.issues).toEqual([
          { path: 'floorLabel', code: 'unknown' },
        ]);
      }
      expect(await unitCount(projectId)).toBe(0);
    });
  });

  describe('reference data (FR-ADM-04)', () => {
    it('FR-ADM-04 a deactivated or unknown item is refused in a new selection', async () => {
      const projectId = await newProject();
      const inactive = {
        layoutId: await fixtures.reference('layouts', false),
        propertyTypeId: await fixtures.reference('property_types', false),
        unitLevelId: await fixtures.reference('unit_levels', false),
        furnishingTypeId: await fixtures.reference('furnishing_types', false),
        tagIds: [await fixtures.reference('unit_tags', false)],
      };
      for (const [field, value] of Object.entries(inactive)) {
        const response = await createUnit(projectId, { [field]: value });
        expect(response.status, field).toBe(400);
        expect(response.body.error.details.issues).toEqual([
          { path: field, code: 'inactive_or_unknown' },
        ]);
      }
      const unknown = await createUnit(projectId, {
        layoutId: '00000000-0000-4000-8000-000000000000',
      });
      expect(unknown.body.error.details.issues).toEqual([
        { path: 'layoutId', code: 'inactive_or_unknown' },
      ]);
    });

    it('FR-ADM-04 an item deactivated later stays on the unit that has it', async () => {
      const projectId = await newProject();
      const layout = await fixtures.reference('layouts');
      const tag = await fixtures.reference('unit_tags');
      const unit = await createUnit(projectId, { layoutId: layout, tagIds: [tag] });
      await h.db.query('UPDATE layouts SET is_active = false WHERE id = $1', [layout]);
      await h.db.query('UPDATE unit_tags SET is_active = false WHERE id = $1', [tag]);

      const kept = await patchUnit(projectId, unit.body.id, {
        layoutId: layout,
        tagIds: [tag, ref.tag],
        view: 'Garden view',
      });
      expect(kept.status).toBe(200);
      expect(kept.body.layoutId).toBe(layout);
      expect([...kept.body.tagIds].sort()).toEqual([tag, ref.tag].sort());

      // Once removed, the deactivated item is a new choice again, and refused.
      await patchUnit(projectId, unit.body.id, { layoutId: ref.layout, tagIds: [] });
      const again = await patchUnit(projectId, unit.body.id, { tagIds: [tag] });
      expect(again.body.error.details.issues).toEqual([
        { path: 'tagIds', code: 'inactive_or_unknown' },
      ]);
      const layoutAgain = await patchUnit(projectId, unit.body.id, { layoutId: layout });
      expect(layoutAgain.body.error.details.issues).toEqual([
        { path: 'layoutId', code: 'inactive_or_unknown' },
      ]);
    });
  });

  describe('history (FR-DAT-09, BR-16)', () => {
    it('FR-DAT-09 one price change through the API adds exactly one history row', async () => {
      const projectId = await newProject('published');
      const unit = await createUnit(projectId);
      const before = Date.now();
      const response = await patchUnit(projectId, unit.body.id, { priceAed: '1300000' });
      expect(response.status).toBe(200);

      const rows = await historyOf(unit.body.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        field: 'price',
        old_value: '1250000.00',
        new_value: '1300000.00',
        changed_by: operator.id,
      });
      expect(rows[0]!.changed_at.getTime()).toBeGreaterThanOrEqual(before - 5000);
      expect(response.body.priceAed).toBe('1300000.00');
      expect(response.body.history).toEqual([
        {
          field: 'price',
          oldValue: '1250000.00',
          newValue: '1300000.00',
          changedBy: operator.id,
          changedAt: rows[0]!.changed_at.toISOString(),
        },
      ]);
    });

    it('FR-DAT-09 one update of price and status adds two rows, one per field', async () => {
      const projectId = await newProject('published');
      const unit = await createUnit(projectId);
      const response = await patchUnit(projectId, unit.body.id, {
        priceAed: '1200000',
        status: 'sold',
      });
      expect(response.status).toBe(200);
      const rows = await historyOf(unit.body.id);
      expect(
        rows.map(({ field, old_value, new_value, changed_by }) => ({
          field,
          old_value,
          new_value,
          changed_by,
        })),
      ).toEqual([
        {
          field: 'price',
          old_value: '1250000.00',
          new_value: '1200000.00',
          changed_by: operator.id,
        },
        { field: 'status', old_value: 'available', new_value: 'sold', changed_by: operator.id },
      ]);
      expect(rows[0]!.changed_at).toEqual(rows[1]!.changed_at);
      expect(response.body.history.map((entry: { field: string }) => entry.field)).toEqual([
        'price',
        'status',
      ]);
    });

    it('FR-DAT-09 an edit that changes neither price nor status adds no history row', async () => {
      const projectId = await newProject();
      const unit = await createUnit(projectId);
      const response = await patchUnit(projectId, unit.body.id, {
        priceAed: '1250000.0',
        status: 'available',
        view: 'City view',
        bathrooms: 3,
      });
      expect(response.status).toBe(200);
      expect(await historyOf(unit.body.id)).toEqual([]);
    });

    it('FR-DAT-09 a price cannot be cleared; an on_request unit keeps its price', async () => {
      const projectId = await newProject();
      const unit = await createUnit(projectId);
      const cleared = await patchUnit(projectId, unit.body.id, {
        status: 'on_request',
        priceAed: null,
      });
      expect(cleared.status).toBe(400);
      expect(cleared.body.error.details.issues).toEqual([
        { path: 'priceAed', code: 'cannot_clear' },
      ]);
      expect(await historyOf(unit.body.id)).toEqual([]);

      const onRequest = await patchUnit(projectId, unit.body.id, { status: 'on_request' });
      expect(onRequest.status).toBe(200);
      expect(onRequest.body).toMatchObject({ status: 'on_request', priceAed: '1250000.00' });
      expect((await historyOf(unit.body.id)).map((row) => row.field)).toEqual(['status']);
    });

    it('FR-DAT-09 a unit on request without a price gets one when it becomes available', async () => {
      const projectId = await newProject();
      const unit = await createUnit(projectId, { status: 'on_request', priceAed: null });
      const missing = await patchUnit(projectId, unit.body.id, { status: 'available' });
      expect(missing.body.error.details.issues).toEqual([{ path: 'priceAed', code: 'required' }]);
      const priced = await patchUnit(projectId, unit.body.id, {
        status: 'available',
        priceAed: '2000000',
      });
      expect(priced.status).toBe(200);
      expect(
        (await historyOf(unit.body.id)).map(({ field, old_value, new_value }) => [
          field,
          old_value,
          new_value,
        ]),
      ).toEqual([
        ['price', null, '2000000.00'],
        ['status', 'on_request', 'available'],
      ]);
    });

    it('BR-16 a history row written through the API cannot be updated or deleted', async () => {
      const projectId = await newProject();
      const unit = await createUnit(projectId);
      await patchUnit(projectId, unit.body.id, { priceAed: '1100000' });
      await expect(
        h.db.query(`UPDATE unit_history SET new_value = '1' WHERE unit_id = $1`, [unit.body.id]),
      ).rejects.toThrow(/BR-16/);
      await expect(
        h.db.query('DELETE FROM unit_history WHERE unit_id = $1', [unit.body.id]),
      ).rejects.toThrow(/BR-16/);
      expect(await historyOf(unit.body.id)).toHaveLength(1);
    });

    it('FR-DAT-09 GET shows the history, newest first', async () => {
      const projectId = await newProject();
      const unit = await createUnit(projectId);
      await patchUnit(projectId, unit.body.id, { priceAed: '1260000' });
      await patchUnit(projectId, unit.body.id, { priceAed: '1270000' });
      const response = await h.get(`${unitsOf(projectId)}/${unit.body.id}`, session);
      expect(response.status).toBe(200);
      expect(response.body.history.map((entry: { newValue: string }) => entry.newValue)).toEqual([
        '1270000.00',
        '1260000.00',
      ]);
    });
  });

  describe('floor plan (FR-DAT-08)', () => {
    const mediaOf = async (projectId: string, mediaId: string) =>
      (
        await h.get(`/content/projects/${projectId}/media?type=floor_plan`, session)
      ).body.items.find((item: { id: string }) => item.id === mediaId);
    const linked = async (mediaId: string) =>
      (await h.db.query('SELECT unit_id FROM media_files WHERE id = $1', [mediaId])).rows[0]
        .unit_id as string | null;

    it('FR-DAT-08 links a floor plan of the project, replaces it and unlinks it', async () => {
      const projectId = await newProject();
      const first = await fixtures.media(projectId, operator.id, { type: 'floor_plan' });
      const second = await fixtures.media(projectId, operator.id, { type: 'floor_plan' });
      const unit = await createUnit(projectId, { floorPlanMediaId: first });
      expect(unit.body.floorPlanMediaId).toBe(first);
      expect((await mediaOf(projectId, first)).unitId).toBe(unit.body.id);

      const replaced = await patchUnit(projectId, unit.body.id, { floorPlanMediaId: second });
      expect(replaced.body.floorPlanMediaId).toBe(second);
      expect(await linked(first)).toBeNull();
      expect(await linked(second)).toBe(unit.body.id);

      const unlinked = await patchUnit(projectId, unit.body.id, { floorPlanMediaId: null });
      expect(unlinked.body.floorPlanMediaId).toBeNull();
      expect(await linked(second)).toBeNull();
    });

    it('FR-DAT-08 refuses media that is not a licensed floor plan of the same project and free', async () => {
      const projectId = await newProject();
      const otherProject = await newProject();
      const image = await fixtures.media(projectId, operator.id, { type: 'image' });
      const elsewhere = await fixtures.media(otherProject, operator.id, { type: 'floor_plan' });
      const unlicensed = await fixtures.media(projectId, operator.id, {
        type: 'floor_plan',
        licenseNote: '  ',
      });
      const taken = await fixtures.media(projectId, operator.id, { type: 'floor_plan' });
      await createUnit(projectId, { floorPlanMediaId: taken });

      for (const [mediaId, code] of [
        [image, 'not_floor_plan'],
        [elsewhere, 'not_found'],
        ['00000000-0000-4000-8000-000000000000', 'not_found'],
        [unlicensed, 'unlicensed'],
        [taken, 'linked_to_other_unit'],
      ] as const) {
        const response = await createUnit(projectId, { floorPlanMediaId: mediaId });
        expect(response.status, code).toBe(400);
        expect(response.body.error.details.issues).toEqual([{ path: 'floorPlanMediaId', code }]);
      }
      expect(await unitCount(projectId)).toBe(1);
    });
  });

  describe('delete (Q5)', () => {
    it('FR-DAT-08 a unit of a never-published project without history is deleted, its floor plan unlinked', async () => {
      const projectId = await newProject('draft');
      const floorPlan = await fixtures.media(projectId, operator.id, { type: 'floor_plan' });
      const unit = await createUnit(projectId, { floorPlanMediaId: floorPlan, tagIds: [ref.tag] });
      const response = await h.send('delete', `${unitsOf(projectId)}/${unit.body.id}`, {
        session,
      });
      expect(response.status).toBe(204);
      expect(await unitCount(projectId)).toBe(0);
      const media = await h.db.query('SELECT unit_id FROM media_files WHERE id = $1', [floorPlan]);
      expect(media.rows).toEqual([{ unit_id: null }]);
      const tags = await h.db.query('SELECT 1 FROM unit_tag_links WHERE unit_id = $1', [
        unit.body.id,
      ]);
      expect(tags.rows).toEqual([]);
    });

    it('BR-16 a unit of a published project is refused (409 UNIT_IN_USE)', async () => {
      const projectId = await newProject('published');
      await h.db.query('UPDATE projects SET published_at = now() WHERE id = $1', [projectId]);
      const unit = await createUnit(projectId);
      const response = await h.send('delete', `${unitsOf(projectId)}/${unit.body.id}`, {
        session,
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('UNIT_IN_USE');
      expect(await unitCount(projectId)).toBe(1);
    });

    it('BR-16 a unit of a project published once and unpublished since is refused', async () => {
      const projectId = await newProject('draft');
      await h.db.query('UPDATE projects SET published_at = now() WHERE id = $1', [projectId]);
      const unit = await createUnit(projectId);
      const response = await h.send('delete', `${unitsOf(projectId)}/${unit.body.id}`, {
        session,
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('UNIT_IN_USE');
    });

    it('BR-16 a unit with history is refused, and its history stays', async () => {
      const projectId = await newProject('draft');
      const unit = await createUnit(projectId);
      await patchUnit(projectId, unit.body.id, { status: 'reserved' });
      const response = await h.send('delete', `${unitsOf(projectId)}/${unit.body.id}`, {
        session,
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('UNIT_IN_USE');
      expect(await historyOf(unit.body.id)).toHaveLength(1);
    });
  });

  describe('project state and scope', () => {
    it('FR-DAT-04 an archived project is read-only for units (409 PROJECT_ARCHIVED)', async () => {
      const projectId = await newProject();
      const unit = await createUnit(projectId);
      await h.db.query("UPDATE projects SET status = 'archived' WHERE id = $1", [projectId]);
      const unitPath = `${unitsOf(projectId)}/${unit.body.id}`;
      for (const response of [
        await createUnit(projectId),
        await patchUnit(projectId, unit.body.id, { priceAed: '1' }),
        await h.send('delete', unitPath, { session }),
      ]) {
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('PROJECT_ARCHIVED');
      }
      expect(await historyOf(unit.body.id)).toEqual([]);
      expect((await h.get(unitPath, session)).status).toBe(200);
      expect((await h.get(unitsOf(projectId), session)).body.total).toBe(1);
    });

    it('a unit of another project answers 404 on every path', async () => {
      const projectId = await newProject();
      const otherProjectId = await newProject();
      const unit = await createUnit(otherProjectId);
      const wrongPath = `${unitsOf(projectId)}/${unit.body.id}`;
      expect((await h.get(wrongPath, session)).status).toBe(404);
      expect((await patchUnit(projectId, unit.body.id, { priceAed: '1' })).status).toBe(404);
      expect((await h.send('delete', wrongPath, { session })).status).toBe(404);
      expect(await historyOf(unit.body.id)).toEqual([]);
    });

    it('an unknown project answers 404', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      expect((await createUnit(unknown)).status).toBe(404);
      expect((await h.get(unitsOf(unknown), session)).status).toBe(404);
    });
  });

  describe('list (FR-DAT-08, FR-UNT-03, NFR-03)', () => {
    let projectId: string;
    const numbers = (body: { items: { unitNumber: string }[] }) =>
      body.items.map((unit) => unit.unitNumber);

    beforeAll(async () => {
      projectId = await newProject();
      const s = await h.sessionFor(operator.email);
      const add = (body: Body) => h.post(unitsOf(projectId), { session: s, body: unitBody(body) });
      // Floors and prices out of order; one unit without a floor and one without a price.
      await add({ unitNumber: 'F10', floorLabel: '10', priceAed: '3000000' });
      await add({ unitNumber: 'F2', floorLabel: '2', priceAed: '1000000', status: 'sold' });
      await add({ unitNumber: 'FG', floorLabel: 'G', priceAed: '2500000' });
      await add({ unitNumber: 'FNONE', floorLabel: null, priceAed: '1500000' });
      await add({
        unitNumber: 'FB',
        floorLabel: 'B',
        priceAed: '2000000',
        layoutId: ref.otherLayout,
      });
      await add({
        unitNumber: 'F1',
        floorLabel: '1',
        status: 'on_request',
        priceAed: null,
        propertyTypeId: ref.otherPropertyType,
      });
      await add({ unitNumber: 'FM', floorLabel: 'M', priceAed: '500000', tagIds: [ref.tag] });
    });

    const list = (query: string) => h.get(`${unitsOf(projectId)}?${query}`, session);

    it('FR-UNT-03 sorting by floor puts basement and ground floors first; no floor comes last', async () => {
      const response = await list('sort=floor&pageSize=100');
      expect(response.status).toBe(200);
      expect(numbers(response.body)).toEqual(['FB', 'FG', 'FM', 'F1', 'F2', 'F10', 'FNONE']);
    });

    it('FR-UNT-03 floor descending keeps units without a floor last', async () => {
      const response = await list('sort=floor&order=desc');
      expect(numbers(response.body)).toEqual(['F10', 'F2', 'F1', 'FM', 'FG', 'FB', 'FNONE']);
    });

    it('FR-UNT-03 sorting by price keeps units without a price last in both directions', async () => {
      expect(numbers((await list('sort=price')).body)).toEqual([
        'FM',
        'F2',
        'FNONE',
        'FB',
        'FG',
        'F10',
        'F1',
      ]);
      expect(numbers((await list('sort=price&order=desc')).body)).toEqual([
        'F10',
        'FG',
        'FB',
        'FNONE',
        'F2',
        'FM',
        'F1',
      ]);
    });

    it('sorts by unit number', async () => {
      expect(numbers((await list('sort=unitNumber')).body)).toEqual([
        'F1',
        'F10',
        'F2',
        'FB',
        'FG',
        'FM',
        'FNONE',
      ]);
    });

    it('FR-UNT-03 filters by status, layout and property type', async () => {
      expect(numbers((await list('status=sold')).body)).toEqual(['F2']);
      expect(numbers((await list(`layoutId=${ref.otherLayout}`)).body)).toEqual(['FB']);
      expect(numbers((await list(`propertyTypeId=${ref.otherPropertyType}`)).body)).toEqual(['F1']);
    });

    it('searches the unit number through q only', async () => {
      const response = await list('q=f1');
      expect(numbers(response.body)).toEqual(['F1', 'F10']);
      expect(response.body.total).toBe(2);
    });

    it('pages with the total, and carries tags and floor plans', async () => {
      const response = await list('pageSize=3&page=2');
      expect(response.body).toMatchObject({ total: 7, page: 2, pageSize: 3 });
      expect(numbers(response.body)).toEqual(['F1', 'F2', 'F10']);
      const fm = (await list('q=FM')).body.items[0];
      expect(fm).toMatchObject({ tagIds: [ref.tag], floorPlanMediaId: null });
      expect(fm).not.toHaveProperty('history');
    });

    describe('500 units (NFR-03)', () => {
      let pool: pg.Pool;
      let statements: string[];

      beforeEach(() => {
        pool = h.app.get<pg.Pool>(DB_POOL);
        statements = [];
        const original = pool.query.bind(pool) as (...args: unknown[]) => unknown;
        vi.spyOn(pool, 'query').mockImplementation(((...args: unknown[]) => {
          const first = args[0];
          statements.push(typeof first === 'string' ? first : (first as { text: string }).text);
          return original(...args);
        }) as never);
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('NFR-03 a list of 500 units runs a fixed number of statements, none per unit', async () => {
        const bigProject = await newProject();
        await h.db.query(
          `INSERT INTO units (project_id, unit_number, property_type_id, layout_id,
             internal_area_sqm, floor_label, floor_sort_key, price_aed)
           SELECT $1, 'N' || g, $2, $3, 80, (g % 40 + 1)::text, g % 40 + 2, 1000000 + g
           FROM generate_series(1, 500) g`,
          [bigProject, ref.propertyType, ref.layout],
        );
        await h.db.query(
          `INSERT INTO unit_tag_links (unit_id, unit_tag_id)
           SELECT id, $2 FROM units WHERE project_id = $1`,
          [bigProject, ref.tag],
        );
        for (let page = 1; page <= 5; page += 1) {
          const before = statements.length;
          const response = await h.get(`${unitsOf(bigProject)}?pageSize=100&page=${page}`, session);
          expect(response.status).toBe(200);
          expect(response.body.items).toHaveLength(100);
          expect(response.body.total).toBe(500);
          expect(
            response.body.items.every((u: { tagIds: string[] }) => u.tagIds.length === 1),
          ).toBe(true);
          const unitStatements = statements
            .slice(before)
            .filter((text) => /"units"|unit_tag_links|media_files/.test(text));
          // The page (tags and floor plans included) and the total.
          expect(unitStatements).toHaveLength(2);
        }
      });
    });
  });
});
