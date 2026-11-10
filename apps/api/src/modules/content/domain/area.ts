import type { Issue } from './issues.js';
import { isInsideUae, type LngLat } from './uae-bounds.js';

export type AreaLevel = 'emirate' | 'community';

/**
 * FR-DAT-03: a community must belong to an emirate, and an emirate belongs to nothing. This checks
 * the request; that the parent exists and is an emirate is checked against the stored area.
 */
export function parentIssue(level: AreaLevel, parentId: string | null | undefined): Issue | null {
  if (level === 'community' && !parentId) return { path: 'parentId', code: 'required' };
  if (level === 'emirate' && parentId) return { path: 'parentId', code: 'not_allowed' };
  return null;
}

/** FR-DAT-03: the parent a community names must be an emirate that exists. */
export function parentAreaIssue(parent: { level: AreaLevel } | null): Issue | null {
  if (!parent) return { path: 'parentId', code: 'not_found' };
  if (parent.level !== 'emirate') return { path: 'parentId', code: 'not_emirate' };
  return null;
}

/** FR-DAT-03, FR-LOC-04: the center point lies inside the UAE. */
export function centerIssue(center: LngLat): Issue | null {
  return isInsideUae(center) ? null : { path: 'center', code: 'outside_uae' };
}
