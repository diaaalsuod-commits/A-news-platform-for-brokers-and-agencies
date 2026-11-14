import type { PoolClient } from 'pg';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

type Response = { status: number; body: { id?: string; isDefault?: boolean; error?: unknown } };

/** The response, or 'pending' if the request has not answered within ms. */
async function answerWithin(request: Promise<Response>, ms: number): Promise<Response | 'pending'> {
  return Promise.race([
    request,
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), ms)),
  ]);
}

const ROUNDS = 10;

/**
 * docs/decisions.md (P4.3): every payment plan write locks the project row FOR UPDATE before it
 * reads or changes a plan, so two default changes on one project run one after the other. Without
 * that lock, the second change clears only the default its statement saw when it started, and
 * setting its own plan then fails on payment_plans_one_default (23505), which is a 500.
 */
describe('Default payment plan under concurrency (FR-DAT-07)', () => {
  const h = useIdentityApp();
  const fixtures = contentFixtures(h);
  let operator: { id: string; email: string };
  let session: string;
  let developerId: string;
  let communityId: string;

  beforeAll(async () => {
    operator = await h.createUser({ role: 'data_operator' });
    developerId = await fixtures.developer();
    communityId = await fixtures.community(await fixtures.emirate());
  });

  beforeEach(async () => {
    session = await h.sessionFor(operator.email);
  });

  const plansOf = (projectId: string) => `/content/projects/${projectId}/payment-plans`;

  /** A project with three plans; the first is the default. */
  async function projectWithPlans(): Promise<{ projectId: string; planIds: string[] }> {
    const projectId = await fixtures.project({
      developerId,
      communityId,
      createdBy: operator.id,
      status: 'published',
    });
    const planIds: string[] = [];
    for (const name of ['A', 'B', 'C']) {
      const created = await h.post(plansOf(projectId), {
        session,
        body: {
          name,
          milestones: [
            {
              labelEn: 'On booking',
              labelAr: 'عند الحجز',
              percentage: '100',
              timing: 'on_booking',
            },
          ],
        },
      });
      expect(created.status).toBe(201);
      planIds.push(created.body.id as string);
    }
    return { projectId, planIds };
  }

  const makeDefault = (projectId: string, planId: string) =>
    h.post(`${plansOf(projectId)}/${planId}/default`, { session }) as Promise<Response>;

  async function defaults(projectId: string): Promise<string[]> {
    const { rows } = await h.db.query(
      'SELECT id FROM payment_plans WHERE project_id = $1 AND is_default ORDER BY id',
      [projectId],
    );
    return rows.map((row) => row.id as string);
  }

  /** A default change between its first write and its commit, as PaymentPlanService runs it. */
  async function defaultChangeUnderWay(projectId: string, planId: string): Promise<PoolClient> {
    const client = await h.db.connect();
    await client.query('BEGIN');
    await client.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
    await client.query(
      'UPDATE payment_plans SET is_default = false WHERE project_id = $1 AND is_default',
      [projectId],
    );
    await client.query('UPDATE payment_plans SET is_default = true WHERE id = $1', [planId]);
    return client;
  }

  it('FR-DAT-07 a default change waits for one under way, then wins; one default remains', async () => {
    const { projectId, planIds } = await projectWithPlans();
    const [, planB, planC] = planIds as [string, string, string];
    const underWay = await defaultChangeUnderWay(projectId, planB);

    const request = makeDefault(projectId, planC);
    expect(await answerWithin(request, 1000)).toBe('pending');
    await underWay.query('COMMIT');
    underWay.release();

    const response = await request;
    expect(response.status).toBe(200);
    expect(response.body.isDefault).toBe(true);
    expect(await defaults(projectId)).toEqual([planC]);
  });

  it(`FR-DAT-07 two concurrent default changes both succeed and leave exactly one default (${ROUNDS} rounds)`, async () => {
    for (let round = 1; round <= ROUNDS; round += 1) {
      const { projectId, planIds } = await projectWithPlans();
      const [, planB, planC] = planIds as [string, string, string];

      const responses = await Promise.all([
        makeDefault(projectId, planB),
        makeDefault(projectId, planC),
      ]);

      expect(
        responses.map((response) => response.status),
        `round ${round}`,
      ).toEqual([200, 200]);
      const left = await defaults(projectId);
      expect(left, `round ${round}`).toHaveLength(1);
      expect([planB, planC], `round ${round}`).toContain(left[0]);
    }
  });
});
