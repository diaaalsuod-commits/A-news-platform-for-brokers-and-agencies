import { describe, expect, it } from 'vitest';
import { formatDateTime, uaeToday } from './format';

describe('UAE dates', () => {
  it('NFR-06 FR-ADM-05 today is the UAE calendar day, which starts at 20:00 UTC', () => {
    expect(uaeToday(new Date('2026-11-08T19:59:59Z'))).toBe('2026-11-08');
    expect(uaeToday(new Date('2026-11-08T20:00:00Z'))).toBe('2026-11-09');
  });

  it('NFR-06 a time is shown in UAE time, 24-hour, with Latin digits', () => {
    expect(formatDateTime('2026-11-08T20:30:00Z')).toBe('2026-11-09 00:30');
    expect(formatDateTime('2026-11-08T07:05:00.000Z')).toBe('2026-11-08 11:05');
    expect(formatDateTime(null)).toBe('');
  });
});
