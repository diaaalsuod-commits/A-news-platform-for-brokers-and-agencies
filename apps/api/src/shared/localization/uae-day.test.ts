import { describe, expect, it } from 'vitest';
import { isFutureUaeDate, uaeDate, uaeDayStart, uaeDaysBetween } from './uae-day.js';

describe('UAE calendar day', () => {
  it('NFR-06 the UAE day starts at 20:00 UTC the evening before', () => {
    expect(uaeDate(new Date('2026-11-08T19:59:59Z'))).toBe('2026-11-08');
    expect(uaeDate(new Date('2026-11-08T20:00:00Z'))).toBe('2026-11-09');
  });

  it('NFR-06 a day starts at 00:00 UAE time', () => {
    expect(uaeDayStart('2026-11-08').toISOString()).toBe('2026-11-07T20:00:00.000Z');
  });

  it('NFR-06 a day after today in the UAE is in the future; today and earlier are not', () => {
    const now = new Date('2026-11-08T21:00:00Z'); // already 9 November in the UAE
    expect(isFutureUaeDate('2026-11-10', now)).toBe(true);
    expect(isFutureUaeDate('2026-11-09', now)).toBe(false);
    expect(isFutureUaeDate('2025-01-01', now)).toBe(false);
  });

  it('NFR-06 counts whole UAE days, not 24-hour periods', () => {
    // 23:59 and 00:01 UAE time on consecutive days are one day apart.
    expect(uaeDaysBetween(new Date('2026-11-08T19:59:00Z'), new Date('2026-11-08T20:01:00Z'))).toBe(
      1,
    );
    // 00:01 and 23:59 UAE time on the same day are zero days apart.
    expect(uaeDaysBetween(new Date('2026-11-07T20:01:00Z'), new Date('2026-11-08T19:59:00Z'))).toBe(
      0,
    );
    expect(uaeDaysBetween(uaeDayStart('2026-01-01'), uaeDayStart('2026-03-01'))).toBe(59);
  });
});
