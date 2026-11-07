import { Decimal } from 'decimal.js';

const SQFT_PER_SQM = '10.7639'; // BR-04

// numeric(14,2) divided by numeric(18,8) needs more digits than the default 20 to stay exact.
const Precise = Decimal.clone({ precision: 40 });

/** The display amount of an AED price (BR-03), as a decimal string with two places. */
export function convertFromAed(amountAed: string, aedPerUnit: string): string {
  const rate = new Precise(aedPerUnit);
  if (!rate.isPositive() || rate.isZero()) {
    throw new RangeError('aedPerUnit must be greater than zero');
  }
  return new Precise(amountAed).dividedBy(rate).toFixed(2, Decimal.ROUND_HALF_UP);
}

/** An area for display in ft² (BR-04), as an unrounded decimal string. */
export function sqmToSqft(sqm: string): string {
  return new Precise(sqm).times(SQFT_PER_SQM).toString();
}
