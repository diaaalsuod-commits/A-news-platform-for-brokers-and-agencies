import { z } from 'zod';
import { unitStatusSchema } from './enums.js';
import { listResponseSchema, pageQuerySchema } from './lists.js';

// Content management (SRS 4.11), part 3b: units and their price and status history (FR-DAT-08,
// FR-DAT-09, BR-16), for the Data Operator only, under /api/v1/content/projects/:projectId/units.

const isoDateTime = z.iso.datetime();

export const UNIT_NUMBER_MAX = 30;
export const UNIT_VIEW_MAX = 100;
export const UNIT_FLOOR_LABEL_MAX = 10;
export const UNIT_BATHROOMS_MAX = 20;
export const UNIT_TAGS_MAX = 20;

/** AED, numeric(14,2): up to 12 digits, then up to 2 decimals, as a string, never a float. */
export const priceAedSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/);

/** m², numeric(10,2): up to 8 digits, then up to 2 decimals, as a string, never a float. */
export const areaSqmSchema = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,2})?$/);

/** An optional field: null clears it; leaving it out changes nothing. */
const nullable = <T extends z.ZodType>(schema: T) => schema.nullable().optional();
/** As nullable, and an empty string clears it too. */
const clearable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? null : value), schema.nullable()).optional();

const tagIdsSchema = z
  .array(z.uuid())
  .max(UNIT_TAGS_MAX)
  .refine((ids) => new Set(ids).size === ids.length, { message: 'duplicate tag' });

/**
 * The floor label is checked by the API (B, B1 to B5, G, M, 1 to 200); an unknown label is 400
 * floorLabel: unknown. tagIds replaces the whole set. floorPlanMediaId links a floor_plan media file
 * of the same project to the unit (null unlinks it).
 */
const unitFields = {
  unitNumber: z.string().trim().min(1).max(UNIT_NUMBER_MAX),
  propertyTypeId: z.uuid(),
  layoutId: z.uuid(),
  unitLevelId: nullable(z.uuid()),
  furnishingTypeId: nullable(z.uuid()),
  bathrooms: nullable(z.number().int().min(0).max(UNIT_BATHROOMS_MAX)),
  internalAreaSqm: areaSqmSchema,
  totalAreaSqm: nullable(areaSqmSchema),
  floorLabel: clearable(z.string().trim().min(1).max(UNIT_FLOOR_LABEL_MAX)),
  /** One text, not one per language: shown as typed (docs/decisions.md, P4.3). */
  view: clearable(z.string().trim().min(1).max(UNIT_VIEW_MAX)),
  priceAed: nullable(priceAedSchema),
  status: unitStatusSchema,
  tagIds: tagIdsSchema,
  floorPlanMediaId: nullable(z.uuid()),
};

/** A new unit: available unless a status is given. */
export const createUnitRequestSchema = z
  .object({
    ...unitFields,
    status: unitStatusSchema.optional(),
    tagIds: tagIdsSchema.optional(),
  })
  .strict();
export type CreateUnitRequest = z.infer<typeof createUnitRequestSchema>;

/** Only the fields sent change. */
export const updateUnitRequestSchema = z.object(unitFields).partial().strict();
export type UpdateUnitRequest = z.infer<typeof updateUnitRequestSchema>;

export const unitSortValues = ['floor', 'price', 'unitNumber'] as const;

/**
 * q matches the unit number. sort=floor orders by the floor's key, then the unit number; price by
 * the AED price, then the unit number. Units without a floor or a price come last in both
 * directions.
 */
export const unitListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(UNIT_NUMBER_MAX).optional(),
  status: unitStatusSchema.optional(),
  layoutId: z.uuid().optional(),
  propertyTypeId: z.uuid().optional(),
  sort: z.enum(unitSortValues).default('floor'),
  order: z.enum(['asc', 'desc']).default('asc'),
});
export type UnitListQuery = z.infer<typeof unitListQuerySchema>;

/** A unit as the Data Operator manages it. Prices and areas are as stored, with two decimals. */
export const unitSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  unitNumber: z.string(),
  propertyTypeId: z.uuid(),
  layoutId: z.uuid(),
  unitLevelId: z.uuid().nullable(),
  furnishingTypeId: z.uuid().nullable(),
  bathrooms: z.number().int().nullable(),
  internalAreaSqm: z.string(),
  totalAreaSqm: z.string().nullable(),
  floorLabel: z.string().nullable(),
  floorSortKey: z.number().int().nullable(),
  view: z.string().nullable(),
  priceAed: z.string().nullable(),
  status: unitStatusSchema,
  tagIds: z.array(z.uuid()),
  floorPlanMediaId: z.uuid().nullable(),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Unit = z.infer<typeof unitSchema>;

/**
 * FR-DAT-09: one recorded change of price or status, append-only (BR-16). changedBy is the user's
 * id; names come with the screens (P4.4).
 */
export const unitHistoryEntrySchema = z.object({
  field: z.enum(['price', 'status']),
  oldValue: z.string().nullable(),
  newValue: z.string(),
  changedBy: z.uuid(),
  changedAt: isoDateTime,
});
export type UnitHistoryEntry = z.infer<typeof unitHistoryEntrySchema>;

/** One unit with its history, newest first (UC-05.9: "updated unit + history"). */
export const unitDetailSchema = unitSchema.extend({
  history: z.array(unitHistoryEntrySchema),
});
export type UnitDetail = z.infer<typeof unitDetailSchema>;

export const unitListResponseSchema = listResponseSchema(unitSchema);
export type UnitListResponse = z.infer<typeof unitListResponseSchema>;
