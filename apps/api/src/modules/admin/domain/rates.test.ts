import { describe, expect, it } from 'vitest';
import { isFutureUaeDate } from '../../../shared/localization/index.js';
import { effectiveAtOf, normaliseRate } from './rates.js';

describe('exchange rates', () => {
  it('FR-ADM-05 a rate applies from 00:00 UAE time of its date', () => {
    expect(effectiveAtOf('2026-11-08').toISOString()).toBe('2026-11-07T20:00:00.000Z');
  });

  it('FR-ADM-05 a rate dated after today in the UAE is refused; today and earlier are not', () => {
    const now = new Date('2026-11-08T21:00:00Z'); // already 9 November in the UAE
    expect(isFutureUaeDate('2026-11-10', now)).toBe(true);
    expect(isFutureUaeDate('2026-11-09', now)).toBe(false);
  });

  it('FR-ADM-05 aed_per_unit must be greater than 0', () => {
    expect(normaliseRate('0')).toBeNull();
    expect(normaliseRate('0.00000000')).toBeNull();
    expect(normaliseRate('-1')).toBeNull();
    expect(normaliseRate('abc')).toBeNull();
  });

  it('FR-LOC-01 rates keep every decimal, with no float rounding', () => {
    expect(normaliseRate('3.67250000')).toBe('3.6725');
    expect(normaliseRate('0.10000001')).toBe('0.10000001');
    expect(normaliseRate('9999999999.99999999')).toBe('9999999999.99999999');
  });
});
