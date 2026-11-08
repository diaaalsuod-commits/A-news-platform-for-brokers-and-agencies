import { Decimal } from 'decimal.js';

/** Asia/Dubai is UTC+4 all year (no daylight saving), so the offset is fixed (NFR-06). */
const UAE_OFFSET_MS = 4 * 60 * 60_000;

/** The UAE calendar day of an instant, as YYYY-MM-DD. */
export function uaeDate(instant: Date): string {
  return new Date(instant.getTime() + UAE_OFFSET_MS).toISOString().slice(0, 10);
}

/** FR-ADM-05: a rate applies from the start (00:00 UAE time) of its effective date. */
export function effectiveAtOf(effectiveDate: string): Date {
  return new Date(`${effectiveDate}T00:00:00+04:00`);
}

/** No future-dated rates: the effective date is today or earlier in the UAE (P3.1). */
export function isFutureUaeDate(effectiveDate: string, now: Date): boolean {
  return effectiveDate > uaeDate(now);
}

/**
 * FR-ADM-05: AED per unit as a canonical decimal string, or null when it is not greater than 0.
 * decimal.js, never a float: "3.67250000" becomes "3.6725".
 */
export function normaliseRate(aedPerUnit: string): string | null {
  let value: Decimal;
  try {
    value = new Decimal(aedPerUnit);
  } catch {
    return null;
  }
  return value.isFinite() && value.greaterThan(0) ? value.toFixed() : null;
}

/** A stored numeric(18,8) rate as its shortest exact decimal string ("3.67250000" -> "3.6725"). */
export function canonicalRate(stored: string): string {
  return new Decimal(stored).toFixed();
}
