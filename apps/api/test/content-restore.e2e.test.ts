import { randomUUID } from 'node:crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProjectReadModel } from '../src/modules/content/index.js';
import { ProjectPublished, ProjectUnpublished } from '../src/shared/events/index.js';
import { uaeDate, uaeDayStart } from '../src/shared/localization/index.js';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

const daysAgo = (n: number) => {
  const today = uaeDayStart(uaeDate(new Date()));
  return uaeDate(new Date(today.getTime() - n * 24 * 60 * 60_000));
};

/**
 * POST /content/projects/:id/restore (P4.4 part b, rule 6): an archived project back to draft,
 * editable again, with published_at kept and no event (FR-DAT-04).
 */
describe('Restoring an archived project (FR-DAT-04)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;
  let communityId: string;
  let readModel: ProjectReadModel;
  const events: string[] = [];
  const listeners: [string, () => void][] = [];

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
    communityId = await fixtures.community(await fixtures.emirate());
    readModel = h.app.get(ProjectReadModel);
    const emitter = h.app.get(EventEmitter2);
    for (const eventClass of [ProjectPublished, ProjectUnpublished]) {
      const listener = () => {
        events.push(eventClass.name);
      };
      emitter.on(eventClass.name, listener);
      listeners.push([eventClass.name, listener]);
    }
  });

  afterAll(() => {
    const emitter = h.app.get(EventEmitter2);
    for (const [name, listener] of listeners) emitter.off(name, listener);
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
    events.length = 0;
  });

  /** A complete, verified draft with a licensed image, so it can be published. */
  async function draft(): Promise<string> {
    const created = await h.post('/content/projects', {
      session,
      body: {
        nameAr: 'واحة الريم',
        nameEn: `Reem Oasis ${randomUUID().slice(0, 8)}`,
        developerId: await fixtures.developer(),
        communityId,
        location: { lng: 55.14, lat: 25.08 },
        stage: 'under_construction',
        ownershipType: 'freehold',
        expectedHandover: { quarter: 2, year: 2030 },
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    await fixtures.media(id, operator.id);
    return id;
  }
  const action = (id: string, name: 'publish' | 'archive' | 'restore') =>
    h.post(`/content/projects/${id}/${name}`, { session });
  const verify = (id: string, days: number) =>
    h.post(`/content/projects/${id}/verify`, {
      session,
      body: { date: daysAgo(days), source: 'Developer sales office' },
    });

  it('FR-DAT-04 an archived project is restored to draft and is editable again', async () => {
    const id = await draft();
    expect((await action(id, 'archive')).status).toBe(200);
    expect(
      (await h.send('patch', `/content/projects/${id}`, { session, body: { nameEn: 'Locked' } }))
        .body.error.code,
    ).toBe('PROJECT_ARCHIVED');

    const restored = await action(id, 'restore');
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ id, status: 'draft' });

    const edited = await h.send('patch', `/content/projects/${id}`, {
      session,
      body: { nameEn: 'Reem Oasis restored' },
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ status: 'draft', nameEn: 'Reem Oasis restored' });
    expect((await verify(id, 1)).status).toBe(200);
  });

  it('FR-DAT-04 a draft or a published project cannot be restored: 409 PROJECT_NOT_ARCHIVED', async () => {
    const id = await draft();
    const onDraft = await action(id, 'restore');
    expect(onDraft.status).toBe(409);
    expect(onDraft.body.error.code).toBe('PROJECT_NOT_ARCHIVED');

    expect((await verify(id, 1)).status).toBe(200);
    expect((await action(id, 'publish')).status).toBe(200);
    const onPublished = await action(id, 'restore');
    expect(onPublished.status).toBe(409);
    expect(onPublished.body.error.code).toBe('PROJECT_NOT_ARCHIVED');
    expect((await h.get(`/content/projects/${id}`, session)).body.status).toBe('published');
  });

  it('FR-DAT-04 the refusal is translated', async () => {
    const id = await draft();
    const response = await h.post(`/content/projects/${id}/restore`, { session, language: 'ar' });
    expect(response.status).toBe(409);
    expect(response.body.error.message).toBe('لا يمكن استعادة إلا مشروع مؤرشف.');
  });

  it('FR-DAT-04 an unknown project answers 404', async () => {
    const response = await action(randomUUID(), 'restore');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('BR-08 a restored project that was published stays a draft: absent from ProjectReadModel, published_at kept, no event', async () => {
    const id = await draft();
    expect((await verify(id, 1)).status).toBe(200);
    const published = await action(id, 'publish');
    expect(published.status).toBe(200);
    const publishedAt = published.body.publishedAt as string;
    expect(await readModel.findPublished(id)).not.toBeNull();

    expect((await action(id, 'archive')).status).toBe(200);
    events.length = 0;
    const restored = await action(id, 'restore');
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ status: 'draft', publishedAt });
    expect(await readModel.findPublished(id)).toBeNull();
    expect(events).toEqual([]);
  });

  it('FR-DAT-10 a stale project is back in needs verification once restored', async () => {
    await h.db.query('UPDATE settings SET stale_threshold_days = 14');
    const id = await draft();
    expect((await verify(id, 30)).status).toBe(200);
    const listed = async () => {
      for (let page = 1; ; page += 1) {
        const response = await h.get(
          `/content/projects/needs-verification?pageSize=100&page=${page}`,
          session,
        );
        expect(response.status).toBe(200);
        const ids = (response.body.items as { id: string }[]).map((item) => item.id);
        if (ids.includes(id)) return true;
        if (page * 100 >= response.body.total) return false;
      }
    };
    expect(await listed()).toBe(true);
    expect((await action(id, 'archive')).status).toBe(200);
    expect(await listed()).toBe(false);
    expect((await action(id, 'restore')).status).toBe(200);
    expect(await listed()).toBe(true);
  });
});
