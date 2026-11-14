import type { PoolClient } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { uaeDate } from '../src/shared/localization/index.js';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

type Response = {
  status: number;
  body: { status?: string; error?: { code: string; details?: unknown } };
};

/** The response, or 'pending' if the request has not answered within ms. */
async function answerWithin(request: Promise<Response>, ms: number): Promise<Response | 'pending'> {
  return Promise.race([
    request,
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), ms)),
  ]);
}

/**
 * docs/decisions.md (P4.2): publishing under concurrency. The blockers are checked and the status
 * set in one transaction with the project row locked FOR UPDATE and the developer read FOR SHARE;
 * an archive locks the developer FOR UPDATE before it counts published projects.
 */
describe('Publishing under concurrency (FR-DAT-05, FR-DAT-01)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;
  let communityId: string;

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
    communityId = await fixtures.community(await fixtures.emirate());
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
  });

  /** A draft of this developer that passes every publishing check. */
  async function publishable(developerId: string): Promise<string> {
    const created = await h.post('/content/projects', {
      session,
      body: {
        nameAr: 'برج السباق',
        nameEn: 'Race Tower',
        developerId,
        communityId,
        location: { lng: 55.14, lat: 25.08 },
        stage: 'under_construction',
        expectedHandover: { quarter: 2, year: 2029 },
        ownershipType: 'freehold',
      },
    });
    expect(created.status).toBe(201);
    const id = created.body.id as string;
    await fixtures.media(id, operator.id);
    const verified = await h.post(`/content/projects/${id}/verify`, {
      session,
      body: { date: uaeDate(new Date()), source: 'Sales office' },
    });
    expect(verified.status).toBe(200);
    return id;
  }

  const publish = (id: string) =>
    h.post(`/content/projects/${id}/publish`, { session }) as Promise<Response>;
  const archiveDeveloper = (developerId: string) =>
    h.send('patch', `/content/developers/${developerId}`, {
      session,
      body: { status: 'archived' },
    }) as Promise<Response>;
  const changeDeveloper = (id: string, developerId: string) =>
    h.send('patch', `/content/projects/${id}`, {
      session,
      body: { developerId },
    }) as Promise<Response>;

  /** Published projects whose developer is archived, among these developers: always none. */
  async function brokenInvariant(developerIds: string[]): Promise<number> {
    const result = await h.db.query(
      `SELECT count(*)::int AS n FROM projects p JOIN developers d ON d.id = p.developer_id
       WHERE p.status = 'published' AND d.status = 'archived' AND d.id = ANY($1)`,
      [developerIds],
    );
    return result.rows[0].n as number;
  }

  /** Another connection inside a transaction, kept open until the test commits it. */
  async function openTransaction(): Promise<PoolClient> {
    const client = await h.db.connect();
    await client.query('BEGIN');
    return client;
  }
  async function commit(client: PoolClient): Promise<void> {
    await client.query('COMMIT');
    client.release();
  }

  /** An archive of the developer between its check and its commit, as DeveloperService runs it. */
  async function archiveUnderWay(developerId: string): Promise<PoolClient> {
    const client = await openTransaction();
    await client.query('SELECT id FROM developers WHERE id = $1 FOR UPDATE', [developerId]);
    const published = await client.query(
      "SELECT count(*)::int AS n FROM projects WHERE developer_id = $1 AND status = 'published'",
      [developerId],
    );
    expect(published.rows[0].n).toBe(0);
    await client.query("UPDATE developers SET status = 'archived' WHERE id = $1", [developerId]);
    return client;
  }

  it('FR-DAT-05 a publish waits for an archive under way, then names the archived developer', async () => {
    const developerId = await fixtures.developer();
    const id = await publishable(developerId);
    const archive = await archiveUnderWay(developerId);

    const publishing = publish(id);
    expect(await answerWithin(publishing, 1000)).toBe('pending');
    await commit(archive);

    const response = await publishing;
    expect(response.status).toBe(422);
    expect(response.body.error).toMatchObject({
      code: 'PUBLISH_BLOCKED',
      details: { blockers: ['developer_archived'] },
    });
    expect(await brokenInvariant([developerId])).toBe(0);
  });

  it('FR-DAT-01 an archive waits for a publish under way, then refuses with 409', async () => {
    const developerId = await fixtures.developer();
    const id = await publishable(developerId);
    // A publish between its check and its commit, as ProjectPublishingService runs it.
    const publishing = await openTransaction();
    await publishing.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [id]);
    await publishing.query('SELECT status FROM developers WHERE id = $1 FOR SHARE', [developerId]);
    await publishing.query(
      "UPDATE projects SET status = 'published', published_at = now() WHERE id = $1",
      [id],
    );

    const archiving = archiveDeveloper(developerId);
    expect(await answerWithin(archiving, 1000)).toBe('pending');
    await commit(publishing);

    const response = await archiving;
    expect(response.status).toBe(409);
    expect(response.body.error?.code).toBe('DEVELOPER_HAS_PUBLISHED_PROJECTS');
    expect(await brokenInvariant([developerId])).toBe(0);
  });

  it('A a developer change on a published project waits for an archive of the new developer, then is refused', async () => {
    const current = await fixtures.developer();
    const next = await fixtures.developer();
    const id = await publishable(current);
    expect((await publish(id)).status).toBe(200);
    const archive = await archiveUnderWay(next);

    const changing = changeDeveloper(id, next);
    expect(await answerWithin(changing, 1000)).toBe('pending');
    await commit(archive);

    const response = await changing;
    expect(response.status).toBe(400);
    expect(response.body.error?.details).toEqual({
      issues: [{ path: 'developerId', code: 'archived' }],
    });
    expect(await brokenInvariant([current, next])).toBe(0);
  });

  it('FR-DAT-05 A publish, developer change and archive at the same time never leave a published project with an archived developer', async () => {
    const developers: string[] = [];
    for (let round = 0; round < 10; round += 1) {
      // A publish racing an archive of its developer.
      const developerId = await fixtures.developer();
      const draft = await publishable(developerId);
      // A developer change of a published project racing an archive of the new developer.
      const from = await fixtures.developer();
      const to = await fixtures.developer();
      const published = await publishable(from);
      expect((await publish(published)).status).toBe(200);
      developers.push(developerId, from, to);

      const responses = await Promise.all([
        publish(draft),
        archiveDeveloper(developerId),
        changeDeveloper(published, to),
        archiveDeveloper(to),
      ]);
      for (const response of responses) expect(response.status).toBeLessThan(500);
      expect(await brokenInvariant([developerId, from, to]), `round ${round}`).toBe(0);
    }
    expect(await brokenInvariant(developers)).toBe(0);
  });

  it('B publish, project edits, developer archives and contact assignments at the same time never deadlock', async () => {
    for (let round = 0; round < 10; round += 1) {
      const developerId = await fixtures.developer();
      const first = await publishable(developerId);
      const second = await publishable(developerId);
      expect((await publish(second)).status).toBe(200);
      const contact = await h.post('/content/sales-contacts', {
        session,
        body: { developerId, fullName: 'Race Contact', phone: '+971501234567' },
      });
      expect(contact.status).toBe(201);
      const assign = (projectIds: string[]) =>
        h.send('patch', `/content/sales-contacts/${contact.body.id}`, {
          session,
          body: { projectIds },
        }) as Promise<Response>;

      const responses = await Promise.all([
        assign([first, second]),
        publish(first),
        h.send('patch', `/content/projects/${second}`, {
          session,
          body: { nameEn: `Edited ${round}` },
        }) as Promise<Response>,
        archiveDeveloper(developerId),
        assign([second, first]),
        h.post(`/content/projects/${second}/unpublish`, { session }) as Promise<Response>,
      ]);
      for (const response of responses) {
        expect(response.status, JSON.stringify(response.body)).toBeLessThan(500);
      }
      expect(await brokenInvariant([developerId])).toBe(0);
    }
    const deadlocks = h.logEntries().filter((entry) => JSON.stringify(entry).includes('40P01'));
    expect(deadlocks).toEqual([]);
  });
});
