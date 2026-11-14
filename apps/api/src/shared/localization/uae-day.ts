/**
 * NFR-06: the UAE calendar day. Asia/Dubai is UTC+4 all year (no daylight saving), so the offset is
 * fixed. Days are YYYY-MM-DD strings, which compare correctly as text.
 */
const UAE_OFFSET_MS = 4 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

/** The UAE calendar day of an instant, as YYYY-MM-DD. */
export function uaeDate(instant: Date): string {
  return new Date(instant.getTime() + UAE_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant a UAE calendar day starts (00:00 UAE time). */
export function uaeDayStart(day: string): Date {
  return new Date(`${day}T00:00:00+04:00`);
}

/** True when the day is after today in the UAE; today and earlier are not in the future. */
export function isFutureUaeDate(day: string, now: Date): boolean {
  return day > uaeDate(now);
}

/** Whole UAE calendar days from one instant's day to another's (0 on the same day). */
export function uaeDaysBetween(from: Date, to: Date): number {
  return Math.round(
    (uaeDayStart(uaeDate(to)).getTime() - uaeDayStart(uaeDate(from)).getTime()) / DAY_MS,
  );
}
