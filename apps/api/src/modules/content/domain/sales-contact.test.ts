import { describe, expect, it } from 'vitest';
import { assignmentIssue, uaeToday, verificationIssue } from './sales-contact.js';

const DEVELOPER_A = 'developer-a';
const DEVELOPER_B = 'developer-b';

describe('sales contact verification', () => {
  // 21:00 UTC on 8 November is already 9 November in the UAE.
  const now = new Date('2026-11-08T21:00:00Z');

  it('NFR-06 today is the UAE calendar day', () => {
    expect(uaeToday(new Date('2026-11-08T19:59:59Z'))).toBe('2026-11-08');
    expect(uaeToday(now)).toBe('2026-11-09');
  });

  it('FR-DAT-02 the verification date and source come together or not at all', () => {
    expect(verificationIssue({ verifiedAt: null, verificationSource: null }, now)).toBeNull();
    expect(
      verificationIssue({ verifiedAt: '2026-11-01', verificationSource: 'Phone call' }, now),
    ).toBeNull();
    expect(verificationIssue({ verifiedAt: '2026-11-01', verificationSource: null }, now)).toEqual({
      path: 'verificationSource',
      code: 'required',
    });
    expect(verificationIssue({ verifiedAt: null, verificationSource: 'Phone call' }, now)).toEqual({
      path: 'verifiedAt',
      code: 'required',
    });
  });

  it('FR-DAT-02 a verification date after today in the UAE is refused; today is not', () => {
    const on = (verifiedAt: string) =>
      verificationIssue({ verifiedAt, verificationSource: 'Phone call' }, now);
    expect(on('2026-11-09')).toBeNull();
    expect(on('2026-11-10')).toEqual({ path: 'verifiedAt', code: 'in_future' });
  });
});

describe('sales contact assignments', () => {
  const ofA = { id: 'project-1', developerId: DEVELOPER_A };
  const ofB = { id: 'project-2', developerId: DEVELOPER_B };

  it('FR-DAT-02 projects of the contact own developer are accepted, and so is no project', () => {
    expect(
      assignmentIssue({
        developerId: DEVELOPER_A,
        wanted: [ofA.id],
        found: [ofA],
        projectIdsSent: true,
      }),
    ).toBeNull();
    expect(
      assignmentIssue({ developerId: DEVELOPER_A, wanted: [], found: [], projectIdsSent: true }),
    ).toBeNull();
  });

  it('FR-DAT-02 a project that does not exist is refused', () => {
    expect(
      assignmentIssue({
        developerId: DEVELOPER_A,
        wanted: [ofA.id, 'missing'],
        found: [ofA],
        projectIdsSent: true,
      }),
    ).toEqual({ path: 'projectIds', code: 'not_found' });
  });

  it("FR-DAT-02 a project of another developer is refused on the request's projectIds", () => {
    expect(
      assignmentIssue({
        developerId: DEVELOPER_A,
        wanted: [ofA.id, ofB.id],
        found: [ofA, ofB],
        projectIdsSent: true,
      }),
    ).toEqual({ path: 'projectIds', code: 'other_developer' });
  });

  it('FR-DAT-02 changing the developer while assigned to projects of the old one is refused', () => {
    expect(
      assignmentIssue({
        developerId: DEVELOPER_B,
        wanted: [ofA.id],
        found: [ofA],
        projectIdsSent: false,
      }),
    ).toEqual({ path: 'developerId', code: 'assigned_to_other_developer' });
  });
});
