import { publishBlockerValues } from '@reih/contracts';
import { describe, expect, it } from 'vitest';
import { uaeDayStart } from '../../../shared/localization/index.js';
import {
  isLicensed,
  isStale,
  ownershipIssue,
  type PublishCheck,
  publishBlockers,
  staleCutoff,
  transitionRefusal,
  verificationDateIssue,
} from './project.js';

/** A project that may be published: every check passes. */
const complete: PublishCheck = {
  developerStatus: 'active',
  communityId: 'community-1',
  location: { lng: 55.27, lat: 25.2 },
  stage: 'under_construction',
  expectedHandover: { quarter: 4, year: 2028 },
  licensedImageCount: 1,
  lastVerifiedAt: new Date('2026-11-01T08:00:00Z'),
};

describe('publishBlockers (FR-DAT-05, UC-05.6)', () => {
  it('FR-DAT-05 a complete project has no blockers', () => {
    expect(publishBlockers(complete)).toEqual([]);
  });

  it('FR-DAT-05 names a missing developer', () => {
    expect(publishBlockers({ ...complete, developerStatus: null })).toEqual(['developer_missing']);
  });

  it('FR-DAT-01 FR-DAT-05 names an archived developer', () => {
    expect(publishBlockers({ ...complete, developerStatus: 'archived' })).toEqual([
      'developer_archived',
    ]);
  });

  it('FR-DAT-05 names a missing community', () => {
    expect(publishBlockers({ ...complete, communityId: null })).toEqual(['community_missing']);
  });

  it('FR-DAT-05 names a missing location', () => {
    expect(publishBlockers({ ...complete, location: null })).toEqual(['location_missing']);
  });

  it('FR-DAT-05 names a location outside the UAE', () => {
    // Muscat, Oman.
    expect(publishBlockers({ ...complete, location: { lng: 58.4, lat: 23.6 } })).toEqual([
      'location_outside_uae',
    ]);
  });

  it('FR-DAT-05 names a missing stage', () => {
    // Without a stage the project is not ready, so its expected handover is still asked for.
    expect(publishBlockers({ ...complete, stage: null })).toEqual(['stage_missing']);
  });

  it('FR-DAT-05 BR-05 names a missing expected handover unless the project is ready', () => {
    for (const stage of ['upcoming', 'under_construction'] as const) {
      expect(publishBlockers({ ...complete, stage, expectedHandover: null })).toEqual([
        'expected_handover_missing',
      ]);
    }
    expect(publishBlockers({ ...complete, stage: 'ready', expectedHandover: null })).toEqual([]);
  });

  it('FR-DAT-05 BR-14 names a missing licensed image', () => {
    expect(publishBlockers({ ...complete, licensedImageCount: 0 })).toEqual([
      'licensed_image_missing',
    ]);
  });

  it('FR-DAT-05 names a missing verification date', () => {
    expect(publishBlockers({ ...complete, lastVerifiedAt: null })).toEqual([
      'verification_missing',
    ]);
  });

  it('FR-DAT-05 lists every missing item, in the stable order', () => {
    const empty: PublishCheck = {
      developerStatus: null,
      communityId: null,
      location: null,
      stage: null,
      expectedHandover: null,
      licensedImageCount: 0,
      lastVerifiedAt: null,
    };
    expect(publishBlockers(empty)).toEqual(
      publishBlockerValues.filter(
        (code) => code !== 'developer_archived' && code !== 'location_outside_uae',
      ),
    );
  });

  it('FR-DAT-04 the expected launch date is never a blocker', () => {
    expect(Object.keys(complete)).not.toContain('expectedLaunchDate');
    expect(publishBlockers({ ...complete, stage: 'upcoming' })).toEqual([]);
  });
});

describe('project rules', () => {
  it('BR-14 media is licensed only with a non-blank source and license', () => {
    expect(isLicensed({ sourceNote: 'Own photo', licenseNote: 'Owned by the team' })).toBe(true);
    expect(isLicensed({ sourceNote: 'Own photo', licenseNote: '  ' })).toBe(false);
    expect(isLicensed({ sourceNote: '', licenseNote: 'CC BY 4.0' })).toBe(false);
  });

  it('FR-DAT-04 a leasehold needs a lease term and a freehold has none', () => {
    expect(ownershipIssue({ ownershipType: 'leasehold', leaseTermYears: 99 })).toBeNull();
    expect(ownershipIssue({ ownershipType: 'freehold', leaseTermYears: null })).toBeNull();
    expect(ownershipIssue({ ownershipType: 'leasehold', leaseTermYears: null })).toEqual({
      path: 'leaseTermYears',
      code: 'required',
    });
    expect(ownershipIssue({ ownershipType: 'freehold', leaseTermYears: 30 })).toEqual({
      path: 'leaseTermYears',
      code: 'not_allowed',
    });
  });

  it('FR-DAT-10 a verification date after today in the UAE is refused', () => {
    const now = new Date('2026-11-08T21:00:00Z'); // already 9 November in the UAE
    expect(verificationDateIssue('2026-11-09', now)).toBeNull();
    expect(verificationDateIssue('2026-11-10', now)).toEqual({ path: 'date', code: 'in_future' });
  });

  it('FR-DAT-04 an archived project is read-only; publish and unpublish follow the status', () => {
    expect(transitionRefusal('archived', 'publish')).toBe('PROJECT_ARCHIVED');
    expect(transitionRefusal('archived', 'archive')).toBe('PROJECT_ARCHIVED');
    expect(transitionRefusal('published', 'publish')).toBe('PROJECT_ALREADY_PUBLISHED');
    expect(transitionRefusal('draft', 'unpublish')).toBe('PROJECT_NOT_PUBLISHED');
    expect(transitionRefusal('draft', 'publish')).toBeNull();
    expect(transitionRefusal('published', 'unpublish')).toBeNull();
    expect(transitionRefusal('draft', 'archive')).toBeNull();
    expect(transitionRefusal('published', 'archive')).toBeNull();
  });
});

describe('isStale (BR-07, FR-PRJ-03, FR-DAT-10)', () => {
  const now = new Date('2026-11-15T06:00:00Z'); // 15 November, 10:00 in the UAE

  it('BR-07 exactly 14 UAE days is not stale with a threshold of 14; 15 is', () => {
    expect(isStale(uaeDayStart('2026-11-01'), 14, now)).toBe(false);
    expect(isStale(uaeDayStart('2026-10-31'), 14, now)).toBe(true);
  });

  it('BR-07 counts UAE calendar days, not 24-hour periods', () => {
    // 23:30 UAE time on 31 October is 15 UAE days before 15 November, though less than 15 x 24 h.
    expect(isStale(new Date('2026-10-31T19:30:00Z'), 14, now)).toBe(true);
    // 00:30 UAE time on 1 November is 14 UAE days before, though more than 14 x 24 h.
    expect(isStale(new Date('2026-10-31T20:30:00Z'), 14, now)).toBe(false);
  });

  it('FR-PRJ-03 a project verified 20 days ago is stale with the default threshold', () => {
    expect(isStale(uaeDayStart('2026-10-26'), 14, now)).toBe(true);
  });

  it('FR-DAT-10 a project never verified is stale', () => {
    expect(isStale(null, 14, now)).toBe(true);
  });

  it('FR-DAT-10 the query cutoff gives the same answer as isStale around the boundary', () => {
    const cutoff = staleCutoff(14, now);
    expect(cutoff.toISOString()).toBe(uaeDayStart('2026-11-01').toISOString());
    for (const instant of [
      new Date('2026-10-31T19:59:59Z'),
      new Date('2026-10-31T20:00:00Z'),
      new Date('2026-10-31T20:00:01Z'),
      new Date('2026-11-14T10:00:00Z'),
    ]) {
      expect(instant < cutoff, instant.toISOString()).toBe(isStale(instant, 14, now));
    }
  });
});
