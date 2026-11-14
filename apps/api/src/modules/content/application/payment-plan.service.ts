import { Injectable } from '@nestjs/common';
import type {
  CreatePaymentPlanRequest,
  MilestoneInput,
  PaymentPlan,
  PaymentPlanListQuery,
  PaymentPlanListResponse,
  UpdatePaymentPlanRequest,
} from '@reih/contracts';
import type { DatabaseTransaction } from '../../../shared/database/index.js';
import { deleteRefusal, isDefaultOnCreate, milestoneIssues } from '../domain/payment-plan.js';
import {
  type MilestoneRow,
  type MilestoneValues,
  PaymentPlanRepository,
  type PaymentPlanRow,
} from '../infrastructure/payment-plan.repository.js';
import { ProjectRepository } from '../infrastructure/project.repository.js';
import { defaultPlanRequired, notFound, validationFailed } from './errors.js';
import { projectArchived } from './project.service.js';

function toPaymentPlan(row: PaymentPlanRow, milestones: readonly MilestoneRow[]): PaymentPlan {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    isDefault: row.isDefault,
    milestones: milestones.map(({ planId: _planId, ...milestone }) => milestone),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toMilestoneValues(milestone: MilestoneInput): MilestoneValues {
  return {
    labelEn: milestone.labelEn,
    labelAr: milestone.labelAr,
    percentage: milestone.percentage,
    timing: milestone.timing,
    dueDate: milestone.dueDate ?? null,
    constructionPct: milestone.constructionPct ?? null,
    monthsAfterHandover: milestone.monthsAfterHandover ?? null,
  };
}

/** BR-02, FR-DAT-07: refuses the milestones with every field and rule before anything is written. */
function assertValidMilestones(milestones: readonly MilestoneInput[]): void {
  const issues = milestoneIssues(milestones);
  if (issues.length > 0) throw validationFailed(...issues);
}

/**
 * FR-DAT-07, UC-05.8: a project's payment plans. Each write runs in one transaction that locks the
 * project row FOR UPDATE first (lock order, docs/decisions.md P4.3), so two writes on the plans of
 * one project never interleave: a project with plans always has exactly one default. An archived
 * project is read-only. Plans are not publishing blockers, so a published project's plans change
 * freely and publishBlockers is not checked here.
 */
@Injectable()
export class PaymentPlanService {
  constructor(
    private readonly plans: PaymentPlanRepository,
    private readonly projects: ProjectRepository,
  ) {}

  async list(projectId: string, query: PaymentPlanListQuery): Promise<PaymentPlanListResponse> {
    if (!(await this.projects.exists(projectId))) throw notFound();
    const { items, total } = await this.plans.list({ projectId, ...query });
    const milestones = await this.plans.milestones(items.map((plan) => plan.id));
    return {
      items: items.map((plan) =>
        toPaymentPlan(
          plan,
          milestones.filter((m) => m.planId === plan.id),
        ),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(projectId: string, planId: string): Promise<PaymentPlan> {
    const plan = await this.plans.find(projectId, planId);
    if (!plan) throw notFound();
    return toPaymentPlan(plan, await this.plans.milestones([plan.id]));
  }

  /** The project's first plan is its default; isDefault: true moves the default to the new plan. */
  async create(projectId: string, input: CreatePaymentPlanRequest): Promise<PaymentPlan> {
    assertValidMilestones(input.milestones);
    const planId = await this.projects.transaction(async (tx) => {
      await this.lockEditable(tx, projectId);
      const existing = await this.plans.countForProject(tx, projectId);
      const isDefault = isDefaultOnCreate(existing, input.isDefault);
      if (isDefault) await this.plans.clearDefault(tx, projectId, new Date());
      const id = await this.plans.insert(tx, { projectId, name: input.name, isDefault });
      await this.plans.replaceMilestones(tx, id, input.milestones.map(toMilestoneValues));
      return id;
    });
    return this.get(projectId, planId);
  }

  /** The name and the whole set of milestones; the default stays where it is. */
  async update(
    projectId: string,
    planId: string,
    input: UpdatePaymentPlanRequest,
  ): Promise<PaymentPlan> {
    assertValidMilestones(input.milestones);
    await this.projects.transaction(async (tx) => {
      await this.lockEditable(tx, projectId);
      if (!(await this.plans.find(projectId, planId, tx))) throw notFound();
      await this.plans.rename(tx, planId, input.name, new Date());
      await this.plans.replaceMilestones(tx, planId, input.milestones.map(toMilestoneValues));
    });
    return this.get(projectId, planId);
  }

  /** Moves the default to this plan; nothing changes when it already is the default. */
  async makeDefault(projectId: string, planId: string): Promise<PaymentPlan> {
    await this.projects.transaction(async (tx) => {
      await this.lockEditable(tx, projectId);
      const plan = await this.plans.find(projectId, planId, tx);
      if (!plan) throw notFound();
      if (plan.isDefault) return;
      const now = new Date();
      await this.plans.clearDefault(tx, projectId, now);
      await this.plans.setDefault(tx, planId, now);
    });
    return this.get(projectId, planId);
  }

  /** The default plan goes only when it is the last one (409 DEFAULT_PLAN_REQUIRED otherwise). */
  async delete(projectId: string, planId: string): Promise<void> {
    await this.projects.transaction(async (tx) => {
      await this.lockEditable(tx, projectId);
      const plan = await this.plans.find(projectId, planId, tx);
      if (!plan) throw notFound();
      if (deleteRefusal(plan, await this.plans.countForProject(tx, projectId))) {
        throw defaultPlanRequired();
      }
      await this.plans.delete(tx, planId);
    });
  }

  /** The project row FOR UPDATE; unknown is 404 and archived is 409 PROJECT_ARCHIVED. */
  private async lockEditable(tx: DatabaseTransaction, projectId: string): Promise<void> {
    const project = await this.projects.lockState(tx, projectId, 'update');
    if (!project) throw notFound();
    if (project.status === 'archived') throw projectArchived();
  }
}
