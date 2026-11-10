import type { Issue } from './issues.js';

const UAE_OFFSET_MS = 4 * 60 * 60_000;

/** The UAE calendar day of an instant, as YYYY-MM-DD (NFR-06). */
export function uaeToday(now: Date): string {
  return new Date(now.getTime() + UAE_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * FR-DAT-02: the verification date and its source come together or not at all, and the date is a
 * UAE calendar day that is today or earlier.
 */
export function verificationIssue(
  contact: { verifiedAt: string | null; verificationSource: string | null },
  now: Date,
): Issue | null {
  const { verifiedAt, verificationSource } = contact;
  if (verifiedAt !== null && verificationSource === null) {
    return { path: 'verificationSource', code: 'required' };
  }
  if (verifiedAt === null && verificationSource !== null) {
    return { path: 'verifiedAt', code: 'required' };
  }
  if (verifiedAt !== null && verifiedAt > uaeToday(now)) {
    return { path: 'verifiedAt', code: 'in_future' };
  }
  return null;
}

/**
 * FR-DAT-02: a contact is assigned only to projects of its own developer.
 *
 * wanted is the set the contact will have: the ids the request sent, or the ones it already has
 * when the request changes only the developer. In that second case the developer is what is
 * refused: the operator clears the assignments first.
 */
export function assignmentIssue(input: {
  developerId: string;
  wanted: readonly string[];
  found: readonly { id: string; developerId: string }[];
  projectIdsSent: boolean;
}): Issue | null {
  const foundIds = new Set(input.found.map((project) => project.id));
  if (input.wanted.some((id) => !foundIds.has(id))) {
    return { path: 'projectIds', code: 'not_found' };
  }
  if (input.found.some((project) => project.developerId !== input.developerId)) {
    return input.projectIdsSent
      ? { path: 'projectIds', code: 'other_developer' }
      : { path: 'developerId', code: 'assigned_to_other_developer' };
  }
  return null;
}
