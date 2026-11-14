import { Inject, Injectable } from '@nestjs/common';
import type { MilestoneTiming } from '@reih/contracts';
import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DATABASE, type DatabaseTransaction } from '../../../shared/database/index.js';
import { paymentPlanMilestones, paymentPlans } from './content.schema.js';

type Reader = NodePgDatabase | DatabaseTransaction;

export interface PaymentPlanRow {
  id: string;
  projectId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MilestoneRow {
  planId: string;
  seq: number;
  labelEn: string;
  labelAr: string | null;
  percentage: string;
  timing: MilestoneTiming;
  dueDate: string | null;
  constructionPct: number | null;
  monthsAfterHandover: number | null;
}

export interface MilestoneValues {
  labelEn: string;
  labelAr: string;
  percentage: string;
  timing: MilestoneTiming;
  dueDate: string | null;
  constructionPct: number | null;
  monthsAfterHandover: number | null;
}

const planColumns = {
  id: paymentPlans.id,
  projectId: paymentPlans.projectId,
  name: paymentPlans.name,
  isDefault: paymentPlans.isDefault,
  createdAt: paymentPlans.createdAt,
  updatedAt: paymentPlans.updatedAt,
};

const milestoneColumns = {
  planId: paymentPlanMilestones.planId,
  seq: paymentPlanMilestones.seq,
  labelEn: paymentPlanMilestones.labelEn,
  labelAr: paymentPlanMilestones.labelAr,
  percentage: paymentPlanMilestones.percentage,
  timing: paymentPlanMilestones.timing,
  dueDate: paymentPlanMilestones.dueDate,
  constructionPct: paymentPlanMilestones.constructionPct,
  monthsAfterHandover: paymentPlanMilestones.monthsAfterHandover,
};

/**
 * FR-DAT-07: a project's payment plans and their milestones. Every write runs in a transaction
 * that has locked the project row FOR UPDATE first (lock order in docs/decisions.md, P4.3), so the
 * plans of one project change one transaction at a time.
 */
@Injectable()
export class PaymentPlanRepository {
  constructor(@Inject(DATABASE) private readonly db: NodePgDatabase) {}

  /** The default plan first, then by creation and id, so pages are stable. */
  async list(filter: {
    projectId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: PaymentPlanRow[]; total: number }> {
    const where = eq(paymentPlans.projectId, filter.projectId);
    const [items, [totals]] = await Promise.all([
      this.db
        .select(planColumns)
        .from(paymentPlans)
        .where(where)
        .orderBy(desc(paymentPlans.isDefault), asc(paymentPlans.createdAt), asc(paymentPlans.id))
        .limit(filter.pageSize)
        .offset((filter.page - 1) * filter.pageSize),
      this.db.select({ total: count() }).from(paymentPlans).where(where),
    ]);
    return { items, total: totals?.total ?? 0 };
  }

  /** The milestones of these plans, by plan and order, in one query. */
  async milestones(planIds: readonly string[], tx: Reader = this.db): Promise<MilestoneRow[]> {
    if (planIds.length === 0) return [];
    return tx
      .select(milestoneColumns)
      .from(paymentPlanMilestones)
      .where(inArray(paymentPlanMilestones.planId, [...planIds]))
      .orderBy(asc(paymentPlanMilestones.planId), asc(paymentPlanMilestones.seq));
  }

  /** One plan of this project, or null; another project's plan is not found. */
  async find(projectId: string, planId: string, tx: Reader = this.db) {
    const [row] = await tx
      .select(planColumns)
      .from(paymentPlans)
      .where(and(eq(paymentPlans.id, planId), eq(paymentPlans.projectId, projectId)));
    return row ?? null;
  }

  async countForProject(tx: DatabaseTransaction, projectId: string): Promise<number> {
    const [row] = await tx
      .select({ n: count() })
      .from(paymentPlans)
      .where(eq(paymentPlans.projectId, projectId));
    return row?.n ?? 0;
  }

  async insert(
    tx: DatabaseTransaction,
    values: { projectId: string; name: string; isDefault: boolean },
  ): Promise<string> {
    const [row] = await tx.insert(paymentPlans).values(values).returning({ id: paymentPlans.id });
    return (row as { id: string }).id;
  }

  async rename(tx: DatabaseTransaction, planId: string, name: string, now: Date): Promise<void> {
    await tx.update(paymentPlans).set({ name, updatedAt: now }).where(eq(paymentPlans.id, planId));
  }

  /**
   * BR-02: the whole set is deleted and inserted again with seq 1..n. plan_total_100 is deferred to
   * the commit, so the plan may be briefly incomplete inside the transaction; rewriting the rows
   * also keeps UNIQUE(plan_id, seq) from refusing a new order.
   */
  async replaceMilestones(
    tx: DatabaseTransaction,
    planId: string,
    milestones: readonly MilestoneValues[],
  ): Promise<void> {
    await tx.delete(paymentPlanMilestones).where(eq(paymentPlanMilestones.planId, planId));
    await tx
      .insert(paymentPlanMilestones)
      .values(milestones.map((milestone, index) => ({ ...milestone, planId, seq: index + 1 })));
  }

  /** Unsets the project's default plan, if any (payment_plans_one_default allows one). */
  async clearDefault(tx: DatabaseTransaction, projectId: string, now: Date): Promise<void> {
    await tx
      .update(paymentPlans)
      .set({ isDefault: false, updatedAt: now })
      .where(and(eq(paymentPlans.projectId, projectId), eq(paymentPlans.isDefault, true)));
  }

  async setDefault(tx: DatabaseTransaction, planId: string, now: Date): Promise<void> {
    await tx
      .update(paymentPlans)
      .set({ isDefault: true, updatedAt: now })
      .where(eq(paymentPlans.id, planId));
  }

  /** The milestones go with it (ON DELETE CASCADE). */
  async delete(tx: DatabaseTransaction, planId: string): Promise<void> {
    await tx.delete(paymentPlans).where(eq(paymentPlans.id, planId));
  }
}
