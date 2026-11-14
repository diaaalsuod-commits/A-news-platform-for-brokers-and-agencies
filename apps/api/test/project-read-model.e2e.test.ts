import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProjectReadModel } from '../src/modules/content/index.js';
import { uaeDate, uaeDayStart } from '../src/shared/localization/index.js';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

const CONTACT_PHONE = '+971509876543';
const CONTACT_WHATSAPP = '+971501112233';
const CONTACT_EMAIL = 'sales.read-model@developer.test';

/** content's read side for explore, project-query and catalog (BR-08, BR-14, FR-CNT-01). */
describe('ProjectReadModel (BR-08, BR-14)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let readModel: ProjectReadModel;
  let operator: { id: string; email: string };
  let session: string;
  let developerId: string;
  let communityId: string;

  beforeAll(async () => {
    readModel = h.app.get(ProjectReadModel);
    operator = await h.createUser({ role: 'data_operator' });
    developerId = await fixtures.developer();
    communityId = await fixtures.community(await fixtures.emirate());
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
  });

  /** A project through the API, published unless told otherwise, with an assigned contact. */
  async function project(end: 'published' | 'draft' | 'archived'): Promise<string> {
    const amenityId = await fixtures.amenity();
    const created = await h.post('/content/projects', {
      session,
      body: {
        nameAr: 'نجمة الخليج',
        nameEn: 'Gulf Star',
        descriptionEn: 'A fictional tower.',
        developerId,
        communityId,
        location: { lng: 55.2, lat: 25.1 },
        stage: 'under_construction',
        expectedHandover: { quarter: 1, year: 2030 },
        ownershipType: 'leasehold',
        leaseTermYears: 99,
        serviceChargeAedPerSqm: '21.75',
        amenityIds: [amenityId],
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    await fixtures.media(id, operator.id, { displayOrder: 2 });
    await h.post(`/content/projects/${id}/verify`, {
      session,
      body: { date: uaeDate(new Date()), source: 'Developer price list' },
    });
    const contact = await h.post('/content/sales-contacts', {
      session,
      body: {
        developerId,
        fullName: 'Read Model Contact',
        phone: CONTACT_PHONE,
        whatsapp: CONTACT_WHATSAPP,
        email: CONTACT_EMAIL,
        projectIds: [id],
      },
    });
    expect(contact.status).toBe(201);
    if (end !== 'draft') {
      expect((await h.post(`/content/projects/${id}/publish`, { session })).status).toBe(200);
    }
    if (end === 'archived') {
      expect((await h.post(`/content/projects/${id}/archive`, { session })).status).toBe(200);
    }
    return id;
  }

  it('BR-08 returns a published project with what the broker-facing modules read', async () => {
    const id = await project('published');
    const found = await readModel.findPublished(id);

    expect(found).toMatchObject({
      id,
      nameEn: 'Gulf Star',
      descriptionEn: 'A fictional tower.',
      developer: { id: developerId },
      community: { id: communityId },
      location: { lng: 55.2, lat: 25.1 },
      stage: 'under_construction',
      expectedHandover: { quarter: 1, year: 2030 },
      ownershipType: 'leasehold',
      leaseTermYears: 99,
      serviceChargeAedPerSqm: '21.75',
      lastVerifiedAt: uaeDayStart(uaeDate(new Date())),
      lastVerificationSource: 'Developer price list',
    });
    expect(found?.amenityIds).toHaveLength(1);
    expect(found?.publishedAt).toBeInstanceOf(Date);
  });

  it('BR-08 a draft and an archived project are never returned', async () => {
    for (const end of ['draft', 'archived'] as const) {
      const id = await project(end);
      expect(await readModel.findPublished(id), end).toBeNull();
      expect(await readModel.listPublishedMedia(id), end).toEqual([]);
    }
    expect(await readModel.findPublished('00000000-0000-4000-8000-000000000000')).toBeNull();
  });

  it('BR-14 media without a recorded source or license is never returned', async () => {
    const id = await project('published');
    const licensed = (await readModel.listPublishedMedia(id)).map((media) => media.id);
    const first = await fixtures.media(id, operator.id, { type: 'brochure', displayOrder: 1 });
    await fixtures.media(id, operator.id, { licenseNote: '' });
    await fixtures.media(id, operator.id, { sourceNote: '   ', type: 'video' });

    const media = await readModel.listPublishedMedia(id);
    expect(media.map((item) => item.id)).toEqual([first, ...licensed]);
    expect(media[0]).toMatchObject({
      type: 'brochure',
      displayOrder: 1,
      mimeType: 'application/pdf',
    });
    expect(media[0]?.fileKey).toMatch(/^project-media\//);
  });

  it('FR-CNT-01 BR-10 returns no contact details', async () => {
    const id = await project('published');
    const everything = JSON.stringify([
      await readModel.findPublished(id),
      await readModel.listPublishedMedia(id),
    ]);
    for (const secret of [CONTACT_PHONE, CONTACT_WHATSAPP, CONTACT_EMAIL, 'Read Model Contact']) {
      expect(everything).not.toContain(secret);
    }
    expect(everything).not.toMatch(/phone|whatsapp|email/i);
  });
});
