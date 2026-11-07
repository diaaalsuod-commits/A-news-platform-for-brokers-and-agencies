import { z } from 'zod';

// The only list of these values. apps/api builds its pgEnums from the same arrays.

export const userRoleValues = [
  'broker',
  'agency_admin',
  'data_operator',
  'platform_admin',
] as const;
export const userRoleSchema = z.enum(userRoleValues);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusValues = ['invited', 'active', 'deactivated'] as const;
export const userStatusSchema = z.enum(userStatusValues);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const agencyStatusValues = ['active', 'suspended'] as const;
export const agencyStatusSchema = z.enum(agencyStatusValues);
export type AgencyStatus = z.infer<typeof agencyStatusSchema>;

export const langCodeValues = ['ar', 'en'] as const;
export const langCodeSchema = z.enum(langCodeValues);
export type LangCode = z.infer<typeof langCodeSchema>;

export const areaUnitValues = ['sqm', 'sqft'] as const;
export const areaUnitSchema = z.enum(areaUnitValues);
export type AreaUnit = z.infer<typeof areaUnitSchema>;

export const areaLevelValues = ['emirate', 'community'] as const;
export const areaLevelSchema = z.enum(areaLevelValues);
export type AreaLevel = z.infer<typeof areaLevelSchema>;

export const recordStatusValues = ['active', 'archived'] as const;
export const recordStatusSchema = z.enum(recordStatusValues);
export type RecordStatus = z.infer<typeof recordStatusSchema>;

export const projectStageValues = ['upcoming', 'under_construction', 'ready'] as const;
export const projectStageSchema = z.enum(projectStageValues);
export type ProjectStage = z.infer<typeof projectStageSchema>;

export const publishStatusValues = ['draft', 'published', 'archived'] as const;
export const publishStatusSchema = z.enum(publishStatusValues);
export type PublishStatus = z.infer<typeof publishStatusSchema>;

export const ownershipTypeValues = ['freehold', 'leasehold'] as const;
export const ownershipTypeSchema = z.enum(ownershipTypeValues);
export type OwnershipType = z.infer<typeof ownershipTypeSchema>;

export const mediaTypeValues = ['image', 'floor_plan', 'brochure', 'master_plan', 'video'] as const;
export const mediaTypeSchema = z.enum(mediaTypeValues);
export type MediaType = z.infer<typeof mediaTypeSchema>;

export const milestoneTimingValues = [
  'on_booking',
  'on_date',
  'construction_stage',
  'on_handover',
  'after_handover',
] as const;
export const milestoneTimingSchema = z.enum(milestoneTimingValues);
export type MilestoneTiming = z.infer<typeof milestoneTimingSchema>;

export const unitStatusValues = ['available', 'reserved', 'sold', 'on_request'] as const;
export const unitStatusSchema = z.enum(unitStatusValues);
export type UnitStatus = z.infer<typeof unitStatusSchema>;

export const historyFieldValues = ['price', 'status'] as const;
export const historyFieldSchema = z.enum(historyFieldValues);
export type HistoryField = z.infer<typeof historyFieldSchema>;

export const noteVisibilityValues = ['client', 'internal'] as const;
export const noteVisibilitySchema = z.enum(noteVisibilityValues);
export type NoteVisibility = z.infer<typeof noteVisibilitySchema>;

export const generationStatusValues = ['queued', 'generating', 'ready', 'failed'] as const;
export const generationStatusSchema = z.enum(generationStatusValues);
export type GenerationStatus = z.infer<typeof generationStatusSchema>;

export const favoriteTargetValues = ['project', 'unit', 'developer'] as const;
export const favoriteTargetSchema = z.enum(favoriteTargetValues);
export type FavoriteTarget = z.infer<typeof favoriteTargetSchema>;
