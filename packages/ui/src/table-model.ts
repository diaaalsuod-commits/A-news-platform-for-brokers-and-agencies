/** What a column sorts by: text, a number, a date, or nothing (a missing value sorts last). */
export type SortValue = string | number | Date | boolean | null | undefined;

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export const TABLE_PAGE_SIZE = 20;

/**
 * Sorts rows by one column, stably, with the screen's language rules for text (Arabic and English
 * names sort as their readers expect). A missing value goes last in either direction.
 */
export function sortRows<T>(
  rows: readonly T[],
  value: (row: T) => SortValue,
  direction: SortDirection,
  locale: string,
): T[] {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: 'base' });
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, key: value(row) }))
    .sort((a, b) => {
      const aMissing = a.key === null || a.key === undefined || a.key === '';
      const bMissing = b.key === null || b.key === undefined || b.key === '';
      if (aMissing || bMissing) {
        return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1;
      }
      const order = compare(
        a.key as NonNullable<SortValue>,
        b.key as NonNullable<SortValue>,
        collator,
      );
      return order === 0 ? a.index - b.index : order * sign;
    })
    .map(({ row }) => row);
}

function compare(
  a: NonNullable<SortValue>,
  b: NonNullable<SortValue>,
  collator: Intl.Collator,
): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

/** The number of pages for this many rows; always at least one. */
export function pageCount(total: number, pageSize = TABLE_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** One page of rows (1-based); a page past the end shows the last page. */
export function pageRows<T>(rows: readonly T[], page: number, pageSize = TABLE_PAGE_SIZE): T[] {
  const last = pageCount(rows.length, pageSize);
  const current = Math.min(Math.max(1, page), last);
  return rows.slice((current - 1) * pageSize, current * pageSize);
}

/** The next sort after a click on a column header: ascending first, then descending. */
export function nextSort(current: SortState | null, key: string): SortState {
  return current?.key === key && current.direction === 'asc'
    ? { key, direction: 'desc' }
    : { key, direction: 'asc' };
}
