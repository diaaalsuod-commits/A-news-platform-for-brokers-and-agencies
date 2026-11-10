/** Times are shown in UAE time (NFR-06); Asia/Dubai is UTC+4 all year. */
export const UAE_TIME_ZONE = 'Asia/Dubai';

const UAE_OFFSET_MS = 4 * 60 * 60_000;

/** The instant moved to UAE wall-clock time, as an ISO string whose fields read as UAE time. */
function uaeIso(instant: Date): string {
  return new Date(instant.getTime() + UAE_OFFSET_MS).toISOString();
}

/** Today's UAE calendar day as YYYY-MM-DD: the latest date a new exchange rate may have. */
export function uaeToday(now: Date = new Date()): string {
  return uaeIso(now).slice(0, 10);
}

/**
 * A date and time in UAE time as "YYYY-MM-DD HH:mm" (24-hour), the same in both languages. A
 * localized Arabic date carries its own direction marks and comes out scrambled inside the
 * <bdi dir="ltr"> that numbers need in Arabic text, so one numeric form is used everywhere.
 */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  const text = uaeIso(new Date(iso));
  return `${text.slice(0, 10)} ${text.slice(11, 16)}`;
}
