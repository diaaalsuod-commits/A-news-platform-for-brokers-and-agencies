import {
  agencyStatusValues,
  areaLevelValues,
  areaUnitValues,
  favoriteTargetValues,
  generationStatusValues,
  historyFieldValues,
  langCodeValues,
  mediaTypeValues,
  milestoneTimingValues,
  noteVisibilityValues,
  ownershipTypeValues,
  projectStageValues,
  publishStatusValues,
  recordStatusValues,
  unitStatusValues,
  userRoleValues,
  userStatusValues,
} from '@reih/contracts';
import { pgEnum } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', userRoleValues);
export const userStatusEnum = pgEnum('user_status', userStatusValues);
export const agencyStatusEnum = pgEnum('agency_status', agencyStatusValues);
export const langCodeEnum = pgEnum('lang_code', langCodeValues);
export const areaUnitEnum = pgEnum('area_unit', areaUnitValues);
export const areaLevelEnum = pgEnum('area_level', areaLevelValues);
export const recordStatusEnum = pgEnum('record_status', recordStatusValues);
export const projectStageEnum = pgEnum('project_stage', projectStageValues);
export const publishStatusEnum = pgEnum('publish_status', publishStatusValues);
export const ownershipTypeEnum = pgEnum('ownership_type', ownershipTypeValues);
export const mediaTypeEnum = pgEnum('media_type', mediaTypeValues);
export const milestoneTimingEnum = pgEnum('milestone_timing', milestoneTimingValues);
export const unitStatusEnum = pgEnum('unit_status', unitStatusValues);
export const historyFieldEnum = pgEnum('history_field', historyFieldValues);
export const noteVisibilityEnum = pgEnum('note_visibility', noteVisibilityValues);
export const generationStatusEnum = pgEnum('generation_status', generationStatusValues);
export const favoriteTargetEnum = pgEnum('favorite_target', favoriteTargetValues);
