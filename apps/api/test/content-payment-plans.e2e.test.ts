import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { contentFixtures } from './support/content-fixtures.js';
import { useIdentityApp } from './support/identity-app.js';

type MilestoneBody = Record<string, unknown>;

const booking = (percentage: unknown): MilestoneBody => ({
  labelEn: 'On booking',
  labelAr: 'عند الحجز',
  percentage,
  timing: 'on_booking',
});
const construction = (percentage: string, constructionPct: number): MilestoneBody => ({
  labelEn: 'During construction',
  labelAr: 'أثناء البناء',
  percentage,
  timing: 'construction_stage',
  constructionPct,
});
const handover = (percentage: string): MilestoneBody => ({
  labelEn: 'On handover',
  labelAr: 'عند التسليم',
  percentage,
  timing: 'on_handover',
});

/** FR-DAT-07, BR-02, UC-05.8: payment plans, managed by Data Operators. */
describe('Payment plans (FR-DAT-07, BR-02)', () => {
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

  const newProject = (status: 'draft' | 'published' | 'archived' = 'draft') =>
    fixtures.project({ developerId, communityId, createdBy: operator.id, status });

  const plansOf = (projectId: string) => `/content/projects/${projectId}/payment-plans`;

  const createPlan = (
    projectId: string,
    body: Record<string, unknown> = {
      name: '10/90',
      milestones: [booking('10'), handover('90')],
    },
  ) => h.post(plansOf(projectId), { session, body });

  async function storedPlans(projectId: string) {
    const { rows } = await h.db.query(
      `SELECT p.id, p.name, p.is_default,
         coalesce(array_agg(m.percentage::text ORDER BY m.seq) FILTER (WHERE m.id IS NOT NULL), '{}'::text[])
           AS percentages
       FROM payment_plans p LEFT JOIN payment_plan_milestones m ON m.plan_id = p.id
       WHERE p.project_id = $1 GROUP BY p.id ORDER BY p.created_at, p.id`,
      [projectId],
    );
    return rows as { id: string; name: string; is_default: boolean; percentages: string[] }[];
  }

  describe('create', () => {
    it('FR-DAT-07 stores a named plan with ordered milestones; the first plan is the default', async () => {
      const projectId = await newProject();
      const response = await createPlan(projectId, {
        name: 'Post-handover plan',
        isDefault: false,
        milestones: [
          booking('10'),
          construction('40.5', 60),
          handover('19.50'),
          {
            labelEn: 'After handover',
            labelAr: 'بعد التسليم',
            percentage: '25',
            timing: 'after_handover',
            monthsAfterHandover: 24,
          },
          {
            labelEn: 'Final payment',
            labelAr: 'الدفعة الأخيرة',
            percentage: '5',
            timing: 'on_date',
            dueDate: '2031-03-31',
          },
        ],
      });
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        projectId,
        name: 'Post-handover plan',
        isDefault: true,
        milestones: [
          { seq: 1, percentage: '10.00', timing: 'on_booking', dueDate: null },
          { seq: 2, percentage: '40.50', timing: 'construction_stage', constructionPct: 60 },
          { seq: 3, percentage: '19.50', timing: 'on_handover' },
          { seq: 4, percentage: '25.00', timing: 'after_handover', monthsAfterHandover: 24 },
          { seq: 5, percentage: '5.00', timing: 'on_date', dueDate: '2031-03-31' },
        ],
      });
      expect(response.body.milestones[0]).toEqual({
        seq: 1,
        labelEn: 'On booking',
        labelAr: 'عند الحجز',
        percentage: '10.00',
        timing: 'on_booking',
        dueDate: null,
        constructionPct: null,
        monthsAfterHandover: null,
      });
    });

    it('FR-DAT-07 BR-02 a plan totalling 99.99% is refused and nothing is stored', async () => {
      const projectId = await newProject();
      const response = await createPlan(projectId, {
        name: 'Short',
        milestones: [booking('10'), handover('89.99')],
      });
      expect(response.status).toBe(400);
      expect(response.body.error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { issues: [{ path: 'milestones', code: 'total_not_100' }] },
      });
      expect(await storedPlans(projectId)).toEqual([]);
    });

    it('BR-02 the database still refuses a plan totalling 99.99% at commit', async () => {
      const projectId = await newProject();
      const client = await h.db.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO payment_plans (project_id, name, is_default) VALUES ($1, 'SQL', true)
           RETURNING id`,
          [projectId],
        );
        await client.query(
          `INSERT INTO payment_plan_milestones (plan_id, seq, label_en, label_ar, percentage, timing)
           VALUES ($1, 1, 'On booking', 'عند الحجز', 99.99, 'on_booking')`,
          [rows[0]!.id],
        );
        await expect(client.query('COMMIT')).rejects.toThrow(/BR-02/);
      } finally {
        client.release();
      }
      expect(await storedPlans(projectId)).toEqual([]);
    });

    it('BR-02 a plan without milestones is refused', async () => {
      const projectId = await newProject();
      const response = await createPlan(projectId, { name: 'Empty', milestones: [] });
      expect(response.status).toBe(400);
      expect(response.body.error.details.issues).toEqual([
        { path: 'milestones', code: 'too_small' },
      ]);
    });

    it('FR-DAT-07 each timing requires its own field and refuses the others', async () => {
      const projectId = await newProject();
      const response = await createPlan(projectId, {
        name: 'Fields',
        milestones: [
          { ...booking('20'), monthsAfterHandover: 6 },
          { ...construction('30', 50), constructionPct: null },
          { ...handover('50'), timing: 'on_date' },
        ],
      });
      expect(response.status).toBe(400);
      expect(response.body.error.details.issues).toEqual([
        { path: 'milestones.0.monthsAfterHandover', code: 'not_allowed' },
        { path: 'milestones.1.constructionPct', code: 'required' },
        { path: 'milestones.2.dueDate', code: 'required' },
      ]);
    });

    it('FR-DAT-07 labels are required in English and Arabic', async () => {
      const projectId = await newProject();
      const { labelAr: _labelAr, ...noArabic } = booking('100');
      const response = await createPlan(projectId, {
        name: 'Labels',
        milestones: [noArabic, { ...handover('0.01'), labelEn: ' ' }],
      });
      expect(response.status).toBe(400);
      expect(response.body.error.details.issues).toEqual([
        { path: 'milestones.0.labelAr', code: 'invalid_type' },
        { path: 'milestones.1.labelEn', code: 'too_small' },
      ]);
    });

    it('FR-DAT-07 a percentage is a decimal string with at most two decimals, never a number', async () => {
      const projectId = await newProject();
      for (const percentage of [100, '33.333', '-10', '1e2', '']) {
        const response = await createPlan(projectId, {
          name: 'Numbers',
          milestones: [booking(percentage)],
        });
        expect(response.status, String(percentage)).toBe(400);
        expect(response.body.error.details.issues[0].path).toBe('milestones.0.percentage');
      }
      expect(await storedPlans(projectId)).toEqual([]);
    });

    it('FR-DAT-07 a second plan is not the default unless asked; isDefault moves the default', async () => {
      const projectId = await newProject();
      const first = await createPlan(projectId);
      const second = await createPlan(projectId);
      expect(second.body.isDefault).toBe(false);
      const third = await createPlan(projectId, {
        name: 'New default',
        isDefault: true,
        milestones: [booking('100')],
      });
      expect(third.body.isDefault).toBe(true);
      expect((await storedPlans(projectId)).map((plan) => [plan.id, plan.is_default])).toEqual([
        [first.body.id, false],
        [second.body.id, false],
        [third.body.id, true],
      ]);
    });

    it('FR-DAT-07 plans of a published project can be created: they are not publishing blockers', async () => {
      const projectId = await newProject('published');
      expect((await createPlan(projectId)).status).toBe(201);
    });

    it('an unknown project answers 404', async () => {
      const unknown = '00000000-0000-4000-8000-000000000000';
      expect((await createPlan(unknown)).status).toBe(404);
      expect((await h.get(plansOf(unknown), session)).status).toBe(404);
    });
  });

  describe('default plan', () => {
    it('FR-DAT-07 making another plan the default unsets the old one', async () => {
      const projectId = await newProject();
      const first = await createPlan(projectId);
      const second = await createPlan(projectId);
      const response = await h.post(`${plansOf(projectId)}/${second.body.id}/default`, { session });
      expect(response.status).toBe(200);
      expect(response.body.isDefault).toBe(true);
      expect((await storedPlans(projectId)).map((plan) => [plan.id, plan.is_default])).toEqual([
        [first.body.id, false],
        [second.body.id, true],
      ]);
    });

    it('FR-DAT-07 making the default plan the default again changes nothing', async () => {
      const projectId = await newProject();
      const first = await createPlan(projectId);
      const response = await h.post(`${plansOf(projectId)}/${first.body.id}/default`, { session });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ isDefault: true, updatedAt: first.body.updatedAt });
    });

    it('FR-DAT-07 two default plans are refused by the database (payment_plans_one_default)', async () => {
      const projectId = await newProject();
      await createPlan(projectId);
      const second = await createPlan(projectId);
      await expect(
        h.db.query('UPDATE payment_plans SET is_default = true WHERE id = $1', [second.body.id]),
      ).rejects.toMatchObject({ code: '23505', constraint: 'payment_plans_one_default' });
      expect((await storedPlans(projectId)).filter((plan) => plan.is_default)).toHaveLength(1);
    });

    it('FR-DAT-07 the list shows the default plan first', async () => {
      const projectId = await newProject();
      await createPlan(projectId, { name: 'A', milestones: [booking('100')] });
      const second = await createPlan(projectId, { name: 'B', milestones: [booking('100')] });
      await h.post(`${plansOf(projectId)}/${second.body.id}/default`, { session });
      const response = await h.get(plansOf(projectId), session);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ total: 2, page: 1, pageSize: 20 });
      expect(response.body.items.map((plan: { name: string }) => plan.name)).toEqual(['B', 'A']);
      expect(response.body.items[1].milestones).toHaveLength(1);
    });
  });

  describe('replace', () => {
    it('BR-02 the whole set of milestones is replaced in one transaction', async () => {
      const projectId = await newProject();
      const plan = await createPlan(projectId, {
        name: '50/50',
        milestones: [booking('50'), handover('50')],
      });
      // In order, the first new row (30) would leave 80% if the trigger checked each statement.
      const response = await h.send('put', `${plansOf(projectId)}/${plan.body.id}`, {
        session,
        body: {
          name: '30/30/40',
          milestones: [booking('30'), construction('30', 50), handover('40')],
        },
      });
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ name: '30/30/40', isDefault: true });
      expect(
        response.body.milestones.map((m: { seq: number; percentage: string }) => [
          m.seq,
          m.percentage,
        ]),
      ).toEqual([
        [1, '30.00'],
        [2, '30.00'],
        [3, '40.00'],
      ]);
      expect((await storedPlans(projectId))[0]!.percentages).toEqual(['30.00', '30.00', '40.00']);
    });

    it('BR-02 a replacement totalling 99.99% is refused and the stored plan stays', async () => {
      const projectId = await newProject();
      const plan = await createPlan(projectId);
      const response = await h.send('put', `${plansOf(projectId)}/${plan.body.id}`, {
        session,
        body: { name: 'Short', milestones: [booking('9.99'), handover('90')] },
      });
      expect(response.status).toBe(400);
      expect(response.body.error.details.issues).toEqual([
        { path: 'milestones', code: 'total_not_100' },
      ]);
      expect(await storedPlans(projectId)).toMatchObject([
        { name: '10/90', percentages: ['10.00', '90.00'] },
      ]);
    });

    it('FR-DAT-07 PUT does not take isDefault: the default moves only by POST …/default', async () => {
      const projectId = await newProject();
      const plan = await createPlan(projectId);
      const response = await h.send('put', `${plansOf(projectId)}/${plan.body.id}`, {
        session,
        body: { name: 'x', isDefault: false, milestones: [booking('100')] },
      });
      expect(response.status).toBe(400);
      expect(response.body.error.details.issues).toEqual([{ path: '', code: 'unrecognized_keys' }]);
    });
  });

  describe('delete', () => {
    it('FR-DAT-07 the default plan cannot be deleted while the project has other plans', async () => {
      const projectId = await newProject();
      const first = await createPlan(projectId);
      const second = await createPlan(projectId);
      const refused = await h.send('delete', `${plansOf(projectId)}/${first.body.id}`, { session });
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('DEFAULT_PLAN_REQUIRED');

      const other = await h.send('delete', `${plansOf(projectId)}/${second.body.id}`, { session });
      expect(other.status).toBe(204);
      expect((await storedPlans(projectId)).map((plan) => plan.id)).toEqual([first.body.id]);
    });

    it('FR-DAT-07 deleting the only plan leaves the project with none, milestones included', async () => {
      const projectId = await newProject();
      const plan = await createPlan(projectId);
      const response = await h.send('delete', `${plansOf(projectId)}/${plan.body.id}`, { session });
      expect(response.status).toBe(204);
      expect(await storedPlans(projectId)).toEqual([]);
      const { rows } = await h.db.query(
        'SELECT count(*)::int AS n FROM payment_plan_milestones WHERE plan_id = $1',
        [plan.body.id],
      );
      expect(rows[0].n).toBe(0);
      // The next plan is the default again.
      expect((await createPlan(projectId)).body.isDefault).toBe(true);
    });
  });

  describe('project state and scope', () => {
    it('FR-DAT-04 an archived project is read-only for plans (409 PROJECT_ARCHIVED)', async () => {
      const projectId = await newProject();
      const plan = await createPlan(projectId);
      await h.db.query("UPDATE projects SET status = 'archived' WHERE id = $1", [projectId]);
      const planPath = `${plansOf(projectId)}/${plan.body.id}`;
      const body = { name: 'x', milestones: [booking('100')] };

      for (const response of [
        await createPlan(projectId, body),
        await h.send('put', planPath, { session, body }),
        await h.post(`${planPath}/default`, { session }),
        await h.send('delete', planPath, { session }),
      ]) {
        expect(response.status).toBe(409);
        expect(response.body.error.code).toBe('PROJECT_ARCHIVED');
      }
      expect((await h.get(planPath, session)).status).toBe(200);
      expect((await h.get(plansOf(projectId), session)).body.total).toBe(1);
    });

    it('a plan of another project answers 404 on every path', async () => {
      const projectId = await newProject();
      const otherProjectId = await newProject();
      const plan = await createPlan(otherProjectId);
      const wrongPath = `${plansOf(projectId)}/${plan.body.id}`;

      expect((await h.get(wrongPath, session)).status).toBe(404);
      expect(
        (
          await h.send('put', wrongPath, {
            session,
            body: { name: 'x', milestones: [booking('100')] },
          })
        ).status,
      ).toBe(404);
      expect((await h.post(`${wrongPath}/default`, { session })).status).toBe(404);
      expect((await h.send('delete', wrongPath, { session })).status).toBe(404);
      expect(await storedPlans(otherProjectId)).toMatchObject([
        { id: plan.body.id, name: '10/90', is_default: true },
      ]);
    });
  });
});
