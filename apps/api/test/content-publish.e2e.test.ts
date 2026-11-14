import { EventEmitter2 } from '@nestjs/event-emitter';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ProjectPublished, ProjectUnpublished } from '../src/shared/events/index.js';
import { uaeDate, uaeDayStart } from '../src/shared/localization/index.js';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

/** The UAE calendar day n days before today. */
const daysAgo = (n: number) => {
  const today = uaeDayStart(uaeDate(new Date()));
  return uaeDate(new Date(today.getTime() - n * 24 * 60 * 60_000));
};

describe('Publishing and verification (FR-DAT-05, FR-DAT-10, UC-05.5)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;
  let communityId: string;
  /** Each event as the listener saw it: its name, the project, and the status another connection read. */
  let events: { name: string; projectId: string; statusSeen: string }[] = [];
  const listeners: [string, (event: { projectId: string }) => Promise<void>][] = [];

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
    communityId = await fixtures.community(await fixtures.emirate());
    const emitter = h.app.get(EventEmitter2);
    for (const eventClass of [ProjectPublished, ProjectUnpublished]) {
      const listener = async ({ projectId }: { projectId: string }) => {
        // A separate connection only sees committed data: this shows the event came after commit.
        const row = await h.db.query('SELECT status FROM projects WHERE id = $1', [projectId]);
        events.push({ name: eventClass.name, projectId, statusSeen: row.rows[0].status });
      };
      emitter.on(eventClass.name, listener);
      listeners.push([eventClass.name, listener]);
    }
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
    events = [];
  });

  afterEach(() => undefined);

  /** A draft that passes every check, with an image and a verification, unless told otherwise. */
  async function draft(
    options: {
      developerId?: string;
      stage?: 'upcoming' | 'under_construction' | 'ready';
      handover?: boolean;
      image?: boolean;
      verified?: boolean;
      location?: { lng: number; lat: number };
    } = {},
  ): Promise<string> {
    const body = {
      nameAr: 'مرسى النخيل',
      nameEn: 'Palm Marina',
      developerId: options.developerId ?? (await fixtures.developer()),
      communityId,
      location: options.location ?? { lng: 55.14, lat: 25.08 },
      stage: options.stage ?? 'under_construction',
      ownershipType: 'freehold',
      ...(options.handover === false ? {} : { expectedHandover: { quarter: 3, year: 2029 } }),
    };
    const created = await h.post('/content/projects', { session, body });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    if (options.image !== false) await fixtures.media(id, operator.id);
    if (options.verified !== false) {
      const verified = await verify(id, { date: daysAgo(1), source: 'Developer sales office' });
      expect(verified.status).toBe(200);
    }
    return id;
  }
  const action = (id: string, name: 'publish' | 'unpublish' | 'archive') =>
    h.post(`/content/projects/${id}/${name}`, { session });
  const verify = (id: string, body: object) =>
    h.post(`/content/projects/${id}/verify`, { session, body });
  const patch = (id: string, body: object) =>
    h.send('patch', `/content/projects/${id}`, { session, body });
  const statusOf = async (id: string) =>
    (await h.db.query('SELECT status FROM projects WHERE id = $1', [id])).rows[0].status as string;
  const expectBlocked = (
    response: { status: number; body: { error: { code: string; details: unknown } } },
    blockers: string[],
  ) => {
    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({ code: 'PUBLISH_BLOCKED', details: { blockers } });
  };

  // ---------------------------------------------------------------- publish (UC-05.5)

  it('FR-DAT-05 publishing a project without a verification date is refused, and the item is named', async () => {
    const id = await draft({ verified: false });
    expectBlocked(await action(id, 'publish'), ['verification_missing']);
    expect(await statusOf(id)).toBe('draft');
    expect(events).toEqual([]);
  });

  it('FR-DAT-05 BR-08 a complete draft is published with its time, and ProjectPublished follows the commit', async () => {
    const id = await draft();
    const before = Date.now();
    const response = await action(id, 'publish');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('published');
    expect(Date.parse(response.body.publishedAt)).toBeGreaterThanOrEqual(before - 1000);
    expect(events).toEqual([{ name: 'ProjectPublished', projectId: id, statusSeen: 'published' }]);
  });

  it('FR-DAT-05 lists every missing item at once, by stable codes', async () => {
    const id = await draft({
      developerId: await fixtures.developer(),
      handover: false,
      image: false,
      verified: false,
      location: { lng: 58.4, lat: 23.6 },
    });
    expectBlocked(await action(id, 'publish'), [
      'location_outside_uae',
      'expected_handover_missing',
      'licensed_image_missing',
      'verification_missing',
    ]);
  });

  it("FR-DAT-01 FR-DAT-05 an archived developer's project cannot be published", async () => {
    const developerId = await fixtures.developer();
    const id = await draft({ developerId });
    await h.db.query("UPDATE developers SET status = 'archived' WHERE id = $1", [developerId]);
    expectBlocked(await action(id, 'publish'), ['developer_archived']);
  });

  it('FR-DAT-05 a location outside the UAE blocks publishing', async () => {
    const id = await draft({ location: { lng: 58.4, lat: 23.6 } });
    expectBlocked(await action(id, 'publish'), ['location_outside_uae']);
  });

  it('FR-DAT-05 BR-05 the expected handover is needed unless the project is ready', async () => {
    expectBlocked(await action(await draft({ handover: false }), 'publish'), [
      'expected_handover_missing',
    ]);
    expectBlocked(await action(await draft({ stage: 'upcoming', handover: false }), 'publish'), [
      'expected_handover_missing',
    ]);
    const ready = await draft({ stage: 'ready', handover: false });
    expect((await action(ready, 'publish')).status).toBe(200);
  });

  it('FR-DAT-05 BR-14 only an image with a recorded source and license counts', async () => {
    const id = await draft({ image: false });
    await fixtures.media(id, operator.id, { licenseNote: '   ' });
    await fixtures.media(id, operator.id, { type: 'brochure' });
    expectBlocked(await action(id, 'publish'), ['licensed_image_missing']);

    await fixtures.media(id, operator.id);
    expect((await action(id, 'publish')).status).toBe(200);
  });

  it('FR-DAT-04 D an upcoming project without an expected launch date can be published', async () => {
    const id = await draft({ stage: 'upcoming' });
    const response = await action(id, 'publish');
    expect(response.status).toBe(200);
    expect(response.body.expectedLaunchDate).toBeNull();
  });

  // ---------------------------------------------------------------- unpublish and archive

  it('FR-DAT-04 status changes follow the status; unpublish and archive emit ProjectUnpublished', async () => {
    const id = await draft();
    expect((await action(id, 'unpublish')).body.error.code).toBe('PROJECT_NOT_PUBLISHED');
    expect((await action(id, 'publish')).status).toBe(200);
    const again = await action(id, 'publish');
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('PROJECT_ALREADY_PUBLISHED');

    const unpublished = await action(id, 'unpublish');
    expect(unpublished.status).toBe(200);
    expect(unpublished.body.status).toBe('draft');
    expect((await action(id, 'publish')).status).toBe(200);
    const archived = await action(id, 'archive');
    expect(archived.body.status).toBe('archived');

    expect(events).toEqual([
      { name: 'ProjectPublished', projectId: id, statusSeen: 'published' },
      { name: 'ProjectUnpublished', projectId: id, statusSeen: 'draft' },
      { name: 'ProjectPublished', projectId: id, statusSeen: 'published' },
      { name: 'ProjectUnpublished', projectId: id, statusSeen: 'archived' },
    ]);
  });

  it('BR-08 archiving a draft emits nothing: it was never visible', async () => {
    const id = await draft();
    expect((await action(id, 'archive')).status).toBe(200);
    expect(events).toEqual([]);
  });

  // ---------------------------------------------------------------- Q1: a published project stays publishable

  it('Q1 FR-DAT-05 an edit that would create a blocker on a published project is refused with 422', async () => {
    const id = await draft({ stage: 'ready', handover: false });
    expect((await action(id, 'publish')).status).toBe(200);

    expectBlocked(await patch(id, { stage: 'under_construction' }), ['expected_handover_missing']);
    expectBlocked(await patch(id, { location: { lng: 58.4, lat: 23.6 } }), [
      'location_outside_uae',
    ]);
    const fine = await patch(id, {
      stage: 'under_construction',
      expectedHandover: { quarter: 1, year: 2030 },
    });
    expect(fine.status).toBe(200);
    expectBlocked(await patch(id, { expectedHandover: null }), ['expected_handover_missing']);
    expect((await h.get(`/content/projects/${id}`, session)).body).toMatchObject({
      status: 'published',
      stage: 'under_construction',
      expectedHandover: { quarter: 1, year: 2030 },
    });
  });

  it('Q1 the same edit on a draft is stored: drafts may be incomplete', async () => {
    const id = await draft({ stage: 'ready', handover: false });
    const response = await patch(id, {
      stage: 'under_construction',
      location: { lng: 58.4, lat: 23.6 },
    });
    expect(response.status).toBe(200);
  });

  // ---------------------------------------------------------------- 2a: archiving a developer

  it('FR-DAT-01 2a a developer with published projects cannot be archived; unpublish first', async () => {
    const developerId = await fixtures.developer();
    const id = await draft({ developerId });
    await draft({ developerId }); // a draft of the same developer never blocks
    expect((await action(id, 'publish')).status).toBe(200);

    const refused = await h.send('patch', `/content/developers/${developerId}`, {
      session,
      body: { status: 'archived' },
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('DEVELOPER_HAS_PUBLISHED_PROJECTS');
    expect(
      (await h.db.query('SELECT status FROM developers WHERE id = $1', [developerId])).rows[0]
        .status,
    ).toBe('active');

    expect((await action(id, 'unpublish')).status).toBe(200);
    const archived = await h.send('patch', `/content/developers/${developerId}`, {
      session,
      body: { status: 'archived' },
    });
    expect(archived.status).toBe(200);
    expect(archived.body.status).toBe('archived');
    expect(await statusOf(id)).toBe('draft');
  });

  // ---------------------------------------------------------------- verification (FR-DAT-10)

  it('FR-DAT-10 verifying a project updates its last-verified date at once', async () => {
    const id = await draft({ verified: false });
    const response = await verify(id, {
      date: daysAgo(0),
      source: 'Price list from the developer',
      notes: 'Checked 12 units',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      lastVerifiedAt: daysAgo(0),
      lastVerificationSource: 'Price list from the developer',
    });
    const history = await h.db.query(
      'SELECT verified_at, source, notes, verified_by FROM project_verifications WHERE project_id = $1',
      [id],
    );
    expect(history.rows).toEqual([
      {
        verified_at: uaeDayStart(daysAgo(0)),
        source: 'Price list from the developer',
        notes: 'Checked 12 units',
        verified_by: operator.id,
      },
    ]);
  });

  it('FR-DAT-10 a future date or a missing source is refused with 400', async () => {
    const id = await draft({ verified: false });
    const future = await verify(id, { date: daysAgo(-1), source: 'Call' });
    expect(future.status).toBe(400);
    expect(future.body.error.details.issues).toEqual([{ path: 'date', code: 'in_future' }]);
    for (const body of [
      { date: daysAgo(0) },
      { date: daysAgo(0), source: '   ' },
      { date: '2026-13-01', source: 'Call' },
      { date: daysAgo(0), source: 'Call', by: 'someone' },
    ]) {
      expect((await verify(id, body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await h.get(`/content/projects/${id}`, session)).body.lastVerifiedAt).toBeNull();
  });

  it('FR-DAT-10 Q5 an older date is kept as history but never moves the last verification back; on the same date the newer entry wins', async () => {
    const id = await draft({ verified: false });
    await verify(id, { date: daysAgo(2), source: 'First' });
    const older = await verify(id, { date: daysAgo(5), source: 'Backfilled' });
    expect(older.body).toMatchObject({
      lastVerifiedAt: daysAgo(2),
      lastVerificationSource: 'First',
    });

    const sameDay = await verify(id, { date: daysAgo(2), source: 'Second call' });
    expect(sameDay.body).toMatchObject({
      lastVerifiedAt: daysAgo(2),
      lastVerificationSource: 'Second call',
    });
    const count = await h.db.query(
      'SELECT count(*)::int AS n FROM project_verifications WHERE project_id = $1',
      [id],
    );
    expect(count.rows[0].n).toBe(3);
  });

  // ---------------------------------------------------------------- needs verification (FR-DAT-10)

  describe('needs verification', () => {
    let tag: string;
    const list = async (query = '') => {
      const response = await h.get(
        `/content/projects/needs-verification?pageSize=100${query}`,
        session,
      );
      expect(response.status).toBe(200);
      return (response.body.items as { id: string; nameEn: string }[]).filter((item) =>
        item.nameEn.startsWith(tag),
      );
    };
    const named = async (name: string, days: number | null, status?: 'publish' | 'archive') => {
      const id = await draft({ verified: false });
      await patch(id, { nameEn: `${tag} ${name}` });
      if (days !== null) await verify(id, { date: daysAgo(days), source: name });
      if (status) expect((await action(id, status)).status).toBe(200);
      return id;
    };

    beforeEach(async () => {
      tag = `NV${Date.now()}`;
      await h.db.query('UPDATE settings SET stale_threshold_days = 14');
    });

    it('FR-DAT-10 BR-07 lists stale projects, never-verified first, then the oldest; 14 days is not stale, 15 is', async () => {
      await named('fresh', 14);
      const never = await named('never', null);
      const fifteen = await named('fifteen', 15);
      const forty = await named('forty', 40, 'publish');

      expect((await list()).map((item) => item.id)).toEqual([never, forty, fifteen]);
    });

    it('FR-DAT-10 archived projects never appear, and status filters drafts or published', async () => {
      const draftId = await named('draft', 30);
      const publishedId = await named('published', 30, 'publish');
      await named('archived', 30, 'archive');

      expect((await list()).map((item) => item.id).sort()).toEqual([draftId, publishedId].sort());
      expect((await list('&status=draft')).map((item) => item.id)).toEqual([draftId]);
      expect((await list('&status=published')).map((item) => item.id)).toEqual([publishedId]);
      expect(
        (await h.get('/content/projects/needs-verification?status=archived', session)).status,
      ).toBe(400);
    });

    it('FR-ADM-06 a changed threshold applies at once', async () => {
      const id = await named('ten', 10);
      expect(await list()).toEqual([]);
      await h.db.query('UPDATE settings SET stale_threshold_days = 7');
      expect((await list()).map((item) => item.id)).toEqual([id]);
    });
  });
});
