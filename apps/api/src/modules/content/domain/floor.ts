/**
 * FR-DAT-08, FR-UNT-03: a unit's floor and the key that orders it, so that basements come first,
 * then the ground floor, the mezzanine and the numbered floors: B5 < … < B1 = B < G < M < 1 < 2 < … < 200.
 *
 * Accepted labels (case and spaces around them do not matter; they are stored upper-case):
 *   B, B1 to B5   basement levels; B and B1 are the same level
 *   G             ground floor
 *   M             mezzanine (one level)
 *   1 to 200      numbered floors, without leading zeros
 * Anything else is refused rather than guessed. The keys are the ones the seeds have always
 * written (Bn = -n, G = 0, M = 1, n = n + 1), so stored units keep their order. Known limit
 * (docs/decisions.md, P4.3): LG/UG, podium levels (P1…), M2 and roof labels are not accepted; adding
 * one needs keys with gaps (for example ×10) and a reseed.
 */
export interface Floor {
  label: string;
  sortKey: number;
}

export const MAX_BASEMENT = 5;
export const MAX_FLOOR = 200;

const BASEMENT = /^B([1-9])$/;
const NUMBERED = /^[1-9]\d{0,2}$/;

/** The floor of a label, or null when the label is not one of the accepted forms. */
export function parseFloor(input: string): Floor | null {
  const label = input.trim().toUpperCase();
  if (label === 'B') return { label, sortKey: -1 };
  if (label === 'G') return { label, sortKey: 0 };
  if (label === 'M') return { label, sortKey: 1 };

  const basement = BASEMENT.exec(label);
  if (basement) {
    const level = Number(basement[1]);
    return level <= MAX_BASEMENT ? { label, sortKey: -level } : null;
  }
  if (NUMBERED.test(label)) {
    const floor = Number(label);
    return floor <= MAX_FLOOR ? { label, sortKey: floor + 1 } : null;
  }
  return null;
}
