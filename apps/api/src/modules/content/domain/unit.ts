import type { UnitStatus } from '@reih/contracts';
import { Decimal } from 'decimal.js';
import type { Issue } from './issues.js';

/** A decimal string greater than 0, read with decimal.js, never as a float. */
function isPositive(value: string): boolean {
  try {
    const decimal = new Decimal(value);
    return decimal.isFinite() && decimal.gt(0);
  } catch {
    return false;
  }
}

/**
 * FR-DAT-08, UC-05.9 (price > 0 or "on request"): a price, when given, is greater than 0; it is
 * required unless the status is on_request; and once a unit has a price it cannot be cleared,
 * because the history row of that change (FR-DAT-09) needs a new value (unit_history.new_value is
 * NOT NULL). Brokers never see the price of an on_request unit (docs/decisions.md, P4.3).
 * `previousPrice` is the stored price, or null for a new unit or one that never had a price.
 */
export function priceIssue(
  unit: { status: UnitStatus; priceAed: string | null },
  previousPrice: string | null,
): Issue | null {
  if (unit.priceAed !== null && !isPositive(unit.priceAed)) {
    return { path: 'priceAed', code: 'out_of_range' };
  }
  if (unit.priceAed === null && previousPrice !== null) {
    return { path: 'priceAed', code: 'cannot_clear' };
  }
  if (unit.priceAed === null && unit.status !== 'on_request') {
    return { path: 'priceAed', code: 'required' };
  }
  return null;
}

/**
 * FR-DAT-08: areas in m², each greater than 0; the internal area does not exceed the total area
 * when a total is given.
 */
export function areaIssue(unit: {
  internalAreaSqm: string;
  totalAreaSqm: string | null;
}): Issue | null {
  if (!isPositive(unit.internalAreaSqm)) return { path: 'internalAreaSqm', code: 'out_of_range' };
  if (unit.totalAreaSqm === null) return null;
  if (!isPositive(unit.totalAreaSqm)) return { path: 'totalAreaSqm', code: 'out_of_range' };
  return new Decimal(unit.internalAreaSqm).gt(new Decimal(unit.totalAreaSqm))
    ? { path: 'internalAreaSqm', code: 'exceeds_total' }
    : null;
}

/**
 * FR-DAT-08, BR-16 (Q5 of P4.3): a unit is deleted only when its project was never published, so
 * no broker can have it in a catalog or a favorite, and it has no price or status history, which
 * must never be lost. Otherwise it stays.
 */
export function unitDeleteAllowed(input: {
  projectPublishedAt: Date | null;
  historyRows: number;
}): boolean {
  return input.projectPublishedAt === null && input.historyRows === 0;
}
