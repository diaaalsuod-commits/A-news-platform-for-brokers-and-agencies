import { z } from 'zod';
import { milestoneTimingSchema } from './enums.js';
import { listResponseSchema, pageQuerySchema } from './lists.js';

// Content management (SRS 4.11), part 3a: payment plans (FR-DAT-07, BR-02), for the Data Operator
// only, under /api/v1/content/projects/:projectId/payment-plans.

const isoDateTime = z.iso.datetime();

/** payment_plans.name is one varchar(120), not one per language: it is shown as typed. */
export const PAYMENT_PLAN_NAME_MAX = 120;
export const MILESTONE_LABEL_MAX = 150;
/** A plan of 1% a month runs past 60 milestones. */
export const PLAN_MILESTONES_MAX = 100;
export const CONSTRUCTION_PCT_MAX = 100;
export const MONTHS_AFTER_HANDOVER_MAX = 120;

/**
 * A milestone's share, numeric(5,2): up to 3 digits, then up to 2 decimals, as a string, never a
 * float. Greater than 0, at most 100, and the plan's total of exactly 100 are checked in the API
 * with decimal.js (BR-02).
 */
export const percentageSchema = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/);

const labelSchema = z.string().trim().min(1).max(MILESTONE_LABEL_MAX);
/** Null and leaving it out mean the same: the field does not apply to this timing. */
const optional = <T extends z.ZodType>(schema: T) => schema.nullable().optional();

/**
 * One milestone. Each timing takes exactly its own field: on_date a dueDate, construction_stage a
 * constructionPct, after_handover monthsAfterHandover; on_booking and on_handover none. That rule
 * is checked in the API, which names the field and the rule (required or not_allowed).
 */
export const milestoneInputSchema = z
  .object({
    labelEn: labelSchema,
    labelAr: labelSchema,
    percentage: percentageSchema,
    timing: milestoneTimingSchema,
    dueDate: optional(z.iso.date()),
    constructionPct: optional(z.number().int().min(1).max(CONSTRUCTION_PCT_MAX)),
    monthsAfterHandover: optional(z.number().int().min(1).max(MONTHS_AFTER_HANDOVER_MAX)),
  })
  .strict();
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;

const planNameSchema = z.string().trim().min(1).max(PAYMENT_PLAN_NAME_MAX);
const milestonesSchema = z.array(milestoneInputSchema).min(1).max(PLAN_MILESTONES_MAX);

/**
 * A new plan. The project's first plan is always its default; isDefault: true on a later plan makes
 * it the default instead of the current one.
 */
export const createPaymentPlanRequestSchema = z
  .object({
    name: planNameSchema,
    isDefault: z.boolean().optional(),
    milestones: milestonesSchema,
  })
  .strict();
export type CreatePaymentPlanRequest = z.infer<typeof createPaymentPlanRequestSchema>;

/** PUT: the name and the whole set of milestones, in the order given. The default moves only by POST …/default. */
export const updatePaymentPlanRequestSchema = z
  .object({
    name: planNameSchema,
    milestones: milestonesSchema,
  })
  .strict();
export type UpdatePaymentPlanRequest = z.infer<typeof updatePaymentPlanRequestSchema>;

export const milestoneSchema = z.object({
  seq: z.number().int().min(1),
  labelEn: z.string(),
  /** Required for every new milestone; null only on a row stored before this rule. */
  labelAr: z.string().nullable(),
  /** As stored, with two decimals ("10.00"). */
  percentage: z.string(),
  timing: milestoneTimingSchema,
  dueDate: z.iso.date().nullable(),
  constructionPct: z.number().int().nullable(),
  monthsAfterHandover: z.number().int().nullable(),
});
export type Milestone = z.infer<typeof milestoneSchema>;

export const paymentPlanSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  isDefault: z.boolean(),
  milestones: z.array(milestoneSchema),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type PaymentPlan = z.infer<typeof paymentPlanSchema>;

/** The default plan first, then by creation. */
export const paymentPlanListResponseSchema = listResponseSchema(paymentPlanSchema);
export type PaymentPlanListResponse = z.infer<typeof paymentPlanListResponseSchema>;

export const paymentPlanListQuerySchema = pageQuerySchema;
export type PaymentPlanListQuery = z.infer<typeof paymentPlanListQuerySchema>;
