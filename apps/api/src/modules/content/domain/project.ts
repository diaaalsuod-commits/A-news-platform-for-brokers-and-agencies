import type {
  ExpectedHandover,
  OwnershipType,
  ProjectStage,
  PublishBlocker,
  PublishStatus,
  RecordStatus,
} from '@reih/contracts';
import {
  isFutureUaeDate,
  uaeDate,
  uaeDayStart,
  uaeDaysBetween,
} from '../../../shared/localization/index.js';
import type { Issue } from './issues.js';
import { isInsideUae, type LngLat } from './uae-bounds.js';

/**
 * What FR-DAT-05 looks at. The database makes the developer, community, location and stage
 * mandatory, so through the API only an archived developer, a location outside the UAE, a missing
 * expected handover, no licensed image and no verification can occur; the other codes keep the
 * rule complete in one place.
 */
export interface PublishCheck {
  /** The developer's status, or null when there is none. */
  developerStatus: RecordStatus | null;
  communityId: string | null;
  location: LngLat | null;
  stage: ProjectStage | null;
  expectedHandover: ExpectedHandover | null;
  /** Images with a recorded source and license (BR-14). */
  licensedImageCount: number;
  lastVerifiedAt: Date | null;
}

/**
 * FR-DAT-05, UC-05.6: every item the project lacks for publishing, by its stable code, in the order
 * of publishBlockerValues. An empty list means the project may be published.
 */
export function publishBlockers(project: PublishCheck): PublishBlocker[] {
  const blockers: PublishBlocker[] = [];
  if (project.developerStatus === null) blockers.push('developer_missing');
  else if (project.developerStatus !== 'active') blockers.push('developer_archived');
  if (project.communityId === null) blockers.push('community_missing');
  if (project.location === null) blockers.push('location_missing');
  else if (!isInsideUae(project.location)) blockers.push('location_outside_uae');
  if (project.stage === null) blockers.push('stage_missing');
  // A ready project is handed over; the expected handover is asked for every other stage.
  if (project.stage !== 'ready' && project.expectedHandover === null) {
    blockers.push('expected_handover_missing');
  }
  if (project.licensedImageCount < 1) blockers.push('licensed_image_missing');
  if (project.lastVerifiedAt === null) blockers.push('verification_missing');
  return blockers;
}

/** FR-DAT-06, BR-14: a media file counts as licensed only with a non-blank source and license. */
export function isLicensed(media: { sourceNote: string; licenseNote: string }): boolean {
  return media.sourceNote.trim() !== '' && media.licenseNote.trim() !== '';
}

/**
 * FR-DAT-04: a leasehold project has a lease term and a freehold one has none (the database also
 * refuses a leasehold without a term).
 */
export function ownershipIssue(project: {
  ownershipType: OwnershipType;
  leaseTermYears: number | null;
}): Issue | null {
  if (project.ownershipType === 'leasehold' && project.leaseTermYears === null) {
    return { path: 'leaseTermYears', code: 'required' };
  }
  if (project.ownershipType === 'freehold' && project.leaseTermYears !== null) {
    return { path: 'leaseTermYears', code: 'not_allowed' };
  }
  return null;
}

/** FR-DAT-10: the verification date is a UAE calendar day, today or earlier. */
export function verificationDateIssue(date: string, now: Date): Issue | null {
  return isFutureUaeDate(date, now) ? { path: 'date', code: 'in_future' } : null;
}

/**
 * The status changes UC-05.5 and FR-DAT-04 allow. An archived project is read-only; restore is the
 * only change it accepts, back to draft (P4.4, rule 6).
 */
export type ProjectTransition = 'publish' | 'unpublish' | 'archive' | 'restore';

export type TransitionRefusal =
  | 'PROJECT_ARCHIVED'
  | 'PROJECT_ALREADY_PUBLISHED'
  | 'PROJECT_NOT_PUBLISHED'
  | 'PROJECT_NOT_ARCHIVED';

export function transitionRefusal(
  status: PublishStatus,
  transition: ProjectTransition,
): TransitionRefusal | null {
  if (transition === 'restore') return status === 'archived' ? null : 'PROJECT_NOT_ARCHIVED';
  if (status === 'archived') return 'PROJECT_ARCHIVED';
  if (transition === 'publish' && status === 'published') return 'PROJECT_ALREADY_PUBLISHED';
  if (transition === 'unpublish' && status !== 'published') return 'PROJECT_NOT_PUBLISHED';
  return null;
}

/**
 * BR-07, FR-PRJ-03, FR-DAT-10: data is stale when its last verification is more UAE calendar days
 * old than the threshold (settings.stale_threshold_days). With a threshold of 14, a project
 * verified 14 days ago is not stale and one verified 15 days ago is. A project never verified is
 * stale. project-query reuses this for the badge (P6.1).
 */
export function isStale(lastVerifiedAt: Date | null, thresholdDays: number, now: Date): boolean {
  return lastVerifiedAt === null || uaeDaysBetween(lastVerifiedAt, now) > thresholdDays;
}

/**
 * The same rule as isStale, as an instant for a query: a verification before the cutoff is stale.
 * The cutoff is 00:00 UAE time, threshold days before today in the UAE.
 */
export function staleCutoff(thresholdDays: number, now: Date): Date {
  const today = uaeDayStart(uaeDate(now));
  return new Date(today.getTime() - thresholdDays * 24 * 60 * 60_000);
}
