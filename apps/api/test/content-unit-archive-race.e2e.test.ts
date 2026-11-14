import type { PoolClient } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

type Response = {
  status: number;
  body: { priceAed?: string; status?: string; error?: { code: string } };
};

/** The response, or 'pending' if the request has not answered within ms. */
async function answerWithin(request: Promise<Response>, ms: number): Promise<Response | 'pending'> {
  return Promise.race([
    request,
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), ms)),
  ]);
}

/**
 * docs/decisions.md (P4.3, addition D): a unit write locks its project row FOR SHARE before the
 * unit, and an archive locks the project row FOR UPDATE, so a unit is never written on an archived
 * project: either the write waits for the archive and answers 409 PROJECT_ARCHIVED, or the archive
 * waits for the write.
 */
describe('Unit writes while the project is archived (FR-DAT-08, FR-DAT-04)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;
  let projectId: string;
  let unitId: string;

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
    projectId = await fixtures.project({
      developerId: await fixtures.developer(),
      communityId: await fixtures.community(await fixtures.emirate()),
      createdBy: operator.id,
      status: 'published',
    });
    const created = await h.post(`/content/projects/${projectId}/units`, {
      session,
      body: {
        unitNumber: 'R-1',
        propertyTypeId: await fixtures.reference('property_types'),
        layoutId: await fixtures.reference('layouts'),
        internalAreaSqm: '70',
        priceAed: '1000000',
      },
    });
    expect(created.status).toBe(201);
    unitId = created.body.id as string;
  });

  const changePrice = (priceAed: string) =>
    h.send('patch', `/content/projects/${projectId}/units/${unitId}`, {
      session,
      body: { priceAed },
    }) as Promise<Response>;
  const archive = () =>
    h.post(`/content/projects/${projectId}/archive`, { session }) as Promise<Response>;

  async function openTransaction(): Promise<PoolClient> {
    const client = await h.db.connect();
    await client.query('BEGIN');
    return client;
  }
  async function commit(client: PoolClient): Promise<void> {
    await client.query('COMMIT');
    client.release();
  }
  async function state() {
    const project = await h.db.query('SELECT status FROM projects WHERE id = $1', [projectId]);
    const unit = await h.db.query('SELECT price_aed FROM units WHERE id = $1', [unitId]);
    const history = await h.db.query(
      'SELECT count(*)::int AS n FROM unit_history WHERE unit_id = $1',
      [unitId],
    );
    return {
      project: project.rows[0].status as string,
      price: unit.rows[0].price_aed as string,
      history: history.rows[0].n as number,
    };
  }

  it('FR-DAT-08 a unit write and an archive never interleave: the write waits and answers 409, or the archive waits', async () => {
    // 1. An archive under way, as ProjectPublishingService runs it: the write waits, then is refused.
    const archiving = await openTransaction();
    await archiving.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
    await archiving.query("UPDATE projects SET status = 'archived' WHERE id = $1", [projectId]);

    const write = changePrice('1100000');
    expect(await answerWithin(write, 1000)).toBe('pending');
    await commit(archiving);
    const refused = await write;
    expect(refused.status).toBe(409);
    expect(refused.body.error?.code).toBe('PROJECT_ARCHIVED');
    expect(await state()).toEqual({ project: 'archived', price: '1000000.00', history: 0 });

    // 2. A unit write under way, as UnitService runs it: the archive waits for it.
    await h.db.query("UPDATE projects SET status = 'published' WHERE id = $1", [projectId]);
    const writing = await openTransaction();
    await writing.query("SELECT set_config('reih.user_id', $1, true)", [operator.id]);
    await writing.query('SELECT id FROM projects WHERE id = $1 FOR SHARE', [projectId]);
    await writing.query('SELECT id FROM units WHERE id = $1 FOR UPDATE', [unitId]);
    await writing.query('UPDATE units SET price_aed = 1200000 WHERE id = $1', [unitId]);

    const archived = archive();
    expect(await answerWithin(archived, 1000)).toBe('pending');
    await commit(writing);
    expect((await archived).status).toBe(200);
    expect(await state()).toEqual({ project: 'archived', price: '1200000.00', history: 1 });
  });
});
