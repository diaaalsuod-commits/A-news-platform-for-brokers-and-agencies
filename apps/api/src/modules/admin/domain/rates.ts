import { Decimal } from 'decimal.js';
import { uaeDayStart } from '../../../shared/localization/index.js';

/** FR-ADM-05: a rate applies from the start (00:00 UAE time) of its effective date. */
export function effectiveAtOf(effectiveDate: string): Date {
  return uaeDayStart(effectiveDate);
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
